<?php
/**
 * Minimal OTP SimplePay v2 client (start, back URL check, IPN).
 *
 * Every request and response is signed with HMAC-SHA384 (base64) using the
 * merchant secret key, exactly as the official SimplePay PHP SDK does.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

class ELT_SimplePay {

	const SDK_VERSION = 'ELT-WordPress:1.0.0';

	/**
	 * Whether merchant + secret key are set.
	 */
	public static function is_configured() {
		$s = elt_settings();
		return '' !== trim( (string) $s['sp_merchant'] ) && '' !== trim( (string) $s['sp_secret'] );
	}

	public static function is_sandbox() {
		return ! empty( elt_settings()['sp_sandbox'] );
	}

	public static function api_url( $endpoint ) {
		$base = self::is_sandbox() ? 'https://sandbox.simplepay.hu/payment/v2/' : 'https://secure.simplepay.hu/payment/v2/';
		return $base . $endpoint;
	}

	/**
	 * Base64 HMAC-SHA384 signature.
	 *
	 * @param string      $data   Exact bytes to sign.
	 * @param string|null $secret Secret key (defaults to the saved one).
	 */
	public static function sign( $data, $secret = null ) {
		$secret = null === $secret ? (string) elt_setting( 'sp_secret' ) : (string) $secret;
		return base64_encode( hash_hmac( 'sha384', (string) $data, trim( $secret ), true ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
	}

	/**
	 * Constant-time signature check.
	 *
	 * @param string $data      Signed bytes.
	 * @param string $signature Received signature.
	 */
	public static function check_signature( $data, $signature ) {
		$signature = trim( (string) $signature );
		if ( '' === $signature || ! self::is_configured() ) {
			return false;
		}
		return hash_equals( self::sign( $data ), $signature );
	}

	public static function salt() {
		return bin2hex( random_bytes( 16 ) );
	}

	/**
	 * JSON exactly as it will be sent and signed.
	 *
	 * @param array $data Data.
	 */
	public static function encode( array $data ) {
		return (string) wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
	}

	public static function iso_date( $timestamp = null ) {
		return gmdate( 'Y-m-d\TH:i:s+00:00', null === $timestamp ? time() : (int) $timestamp );
	}

	/**
	 * Signed POST to the SimplePay API.
	 *
	 * @param string $endpoint e.g. "start".
	 * @param array  $data     Request body.
	 * @return array|WP_Error Decoded, signature-checked response.
	 */
	public static function request( $endpoint, array $data ) {
		$body     = self::encode( $data );
		$response = wp_remote_post(
			self::api_url( $endpoint ),
			array(
				'timeout'     => 30,
				'headers'     => array(
					'Content-Type' => 'application/json',
					'Signature'    => self::sign( $body ),
				),
				'body'        => $body,
				'data_format' => 'body',
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$raw  = (string) wp_remote_retrieve_body( $response );
		$json = json_decode( $raw, true );
		if ( ! is_array( $json ) ) {
			return new WP_Error( 'elt_sp_response', 'A SimplePay érvénytelen választ küldött (HTTP ' . (int) wp_remote_retrieve_response_code( $response ) . ').' );
		}
		if ( ! empty( $json['errorCodes'] ) ) {
			return new WP_Error( 'elt_sp_error', 'SimplePay hibakód: ' . implode( ', ', array_map( 'strval', (array) $json['errorCodes'] ) ), $json );
		}
		if ( ! self::check_signature( $raw, (string) wp_remote_retrieve_header( $response, 'signature' ) ) ) {
			return new WP_Error( 'elt_sp_signature', 'A SimplePay válasz aláírása nem egyezik. Ellenőrizd a titkos kulcsot.' );
		}
		return $json;
	}

	/**
	 * Start a card payment.
	 *
	 * @param array $args { order_ref, email, amount, back_url }.
	 * @return array|WP_Error Response with paymentUrl and transactionId.
	 */
	public static function start( array $args ) {
		$s = elt_settings();
		return self::request(
			'start',
			array(
				'salt'          => self::salt(),
				'merchant'      => trim( (string) $s['sp_merchant'] ),
				'orderRef'      => (string) $args['order_ref'],
				'currency'      => 'HUF',
				'customerEmail' => (string) $args['email'],
				'language'      => 'HU',
				'sdkVersion'    => self::SDK_VERSION,
				'methods'       => array( 'CARD' ),
				'total'         => (int) $args['amount'],
				'timeout'       => self::iso_date( time() + 30 * MINUTE_IN_SECONDS ),
				'url'           => (string) $args['back_url'],
			)
		);
	}

	/**
	 * Decode + verify the back URL parameters (?r=...&s=...).
	 *
	 * @param string $r Base64 JSON.
	 * @param string $s Signature.
	 * @return array|false { r, t, e, m, o } or false when invalid.
	 */
	public static function parse_back( $r, $s ) {
		$r       = str_replace( ' ', '+', (string) $r );
		$s       = str_replace( ' ', '+', (string) $s );
		$decoded = base64_decode( $r, true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
		if ( false === $decoded ) {
			return false;
		}
		if ( ! self::check_signature( $decoded, $s ) && ! self::check_signature( $r, $s ) ) {
			return false;
		}
		$json = json_decode( $decoded, true );
		if ( ! is_array( $json ) || empty( $json['o'] ) ) {
			return false;
		}
		if ( trim( (string) ( $json['m'] ?? '' ) ) !== trim( (string) elt_setting( 'sp_merchant' ) ) ) {
			return false;
		}
		return $json;
	}

	/**
	 * Build the signed IPN confirmation for a verified IPN body.
	 *
	 * @param array $ipn Decoded IPN.
	 * @return array [ body, signature ]
	 */
	public static function ipn_confirmation( array $ipn ) {
		$ipn['receiveDate'] = self::iso_date();
		$body               = self::encode( $ipn );
		return array( $body, self::sign( $body ) );
	}

	/**
	 * SimplePay IPN status → donation status.
	 *
	 * @param string $status IPN status.
	 */
	public static function map_ipn_status( $status ) {
		$map = array(
			'FINISHED'      => 'sikeres',
			'AUTHORIZED'    => 'sikeres',
			'NOTAUTHORIZED' => 'sikertelen',
			'CANCELLED'     => 'megszakitott',
			'CANCELED'      => 'megszakitott',
			'TIMEOUT'       => 'idotullepes',
			'REFUND'        => 'visszateritve',
			'REVERSED'      => 'visszateritve',
		);
		$status = strtoupper( (string) $status );
		return $map[ $status ] ?? '';
	}

	/**
	 * Back URL event → donation status.
	 *
	 * @param string $event SUCCESS / FAIL / CANCEL / TIMEOUT.
	 */
	public static function map_back_event( $event ) {
		$map = array(
			'SUCCESS' => 'sikeres',
			'FAIL'    => 'sikertelen',
			'CANCEL'  => 'megszakitott',
			'TIMEOUT' => 'idotullepes',
		);
		return $map[ strtoupper( (string) $event ) ] ?? '';
	}
}
