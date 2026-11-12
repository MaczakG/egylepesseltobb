<?php
/**
 * Online donations through SimplePay: records, IPN endpoint, payment result page.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

class ELT_Donations {

	const IPN_ROUTE = '/elt/v1/simplepay-ipn';

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
		add_filter( 'rest_pre_serve_request', array( __CLASS__, 'serve_raw_ipn' ), 10, 4 );
		add_shortcode( 'elt_fizetes_eredmeny', array( __CLASS__, 'result_shortcode' ) );

		add_filter( 'manage_' . ELT_DON . '_posts_columns', array( __CLASS__, 'columns' ) );
		add_action( 'manage_' . ELT_DON . '_posts_custom_column', array( __CLASS__, 'column' ), 10, 2 );
		add_action( 'add_meta_boxes_' . ELT_DON, array( __CLASS__, 'meta_boxes' ) );
	}

	public static function statuses() {
		return array(
			'fuggo'         => 'Folyamatban',
			'sikeres'       => 'Sikeres',
			'sikertelen'    => 'Sikertelen',
			'megszakitott'  => 'Megszakított',
			'idotullepes'   => 'Időtúllépés',
			'visszateritve' => 'Visszatérítve',
			'hiba'          => 'Hiba az indításkor',
		);
	}

	public static function ipn_url() {
		return rest_url( ltrim( self::IPN_ROUTE, '/' ) );
	}

	public static function result_url() {
		$page = (int) elt_setting( 'sp_result_page' );
		if ( ! $page || 'publish' !== get_post_status( $page ) ) {
			// Default: the page with the slug "fizetes-eredmenye".
			$found = get_page_by_path( 'fizetes-eredmenye' );
			$page  = $found ? (int) $found->ID : 0;
		}
		$url = $page && 'publish' === get_post_status( $page ) ? get_permalink( $page ) : '';
		return $url ? $url : home_url( '/' );
	}

	/**
	 * Create a pending donation.
	 *
	 * @param array $data { nev, email, osszeg, mezok }.
	 * @return int|WP_Error Donation ID.
	 */
	public static function create_pending( array $data ) {
		$amount = absint( $data['osszeg'] ?? 0 );
		$name   = sanitize_text_field( $data['nev'] ?? '' );
		$email  = sanitize_email( $data['email'] ?? '' );
		$id     = wp_insert_post(
			array(
				'post_type'   => ELT_DON,
				'post_status' => 'publish',
				'post_title'  => trim( ( '' !== $name ? $name : $email ) . ' – ' . elt_format_ft( $amount ) ),
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		$fields = array();
		foreach ( (array) ( $data['mezok'] ?? array() ) as $label => $value ) {
			$fields[ sanitize_text_field( $label ) ] = sanitize_textarea_field( is_array( $value ) ? implode( ', ', $value ) : (string) $value );
		}
		update_post_meta( $id, 'elt_nev', $name );
		update_post_meta( $id, 'elt_email', $email );
		update_post_meta( $id, 'elt_osszeg', $amount );
		update_post_meta( $id, 'elt_allapot', 'fuggo' );
		update_post_meta( $id, 'elt_order_ref', 'ELT-' . $id . '-' . strtoupper( wp_generate_password( 6, false, false ) ) );
		update_post_meta( $id, 'elt_mezok', $fields );
		update_post_meta( $id, 'elt_sandbox', ELT_SimplePay::is_sandbox() ? 1 : 0 );
		self::log( $id, 'Létrehozva', array( 'osszeg' => $amount ) );
		return $id;
	}

	public static function find_by_order_ref( $order_ref ) {
		$ids = get_posts(
			array(
				'post_type'      => ELT_DON,
				'post_status'    => 'any',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'meta_key'       => 'elt_order_ref', // phpcs:ignore WordPress.DB.SlowDBQuery
				'meta_value'     => (string) $order_ref, // phpcs:ignore WordPress.DB.SlowDBQuery
			)
		);
		return $ids ? (int) $ids[0] : 0;
	}

	/**
	 * Append an entry to the donation's history.
	 *
	 * @param int    $id      Donation ID.
	 * @param string $message Message.
	 * @param array  $data    Extra data.
	 */
	public static function log( $id, $message, array $data = array() ) {
		$log = get_post_meta( $id, 'elt_naplo', true );
		$log = is_array( $log ) ? $log : array();
		$log[] = array(
			'ido'    => current_time( 'mysql' ),
			'uzenet' => $message,
			'adat'   => $data,
		);
		update_post_meta( $id, 'elt_naplo', $log );
	}

	/**
	 * Update status; sends the notification e-mail the first time a donation succeeds.
	 *
	 * @param int    $id     Donation ID.
	 * @param string $status New status.
	 * @param string $source Where the info came from.
	 * @param array  $data   Extra data for the log.
	 */
	public static function set_status( $id, $status, $source, array $data = array() ) {
		if ( ! isset( self::statuses()[ $status ] ) ) {
			return;
		}
		$old = get_post_meta( $id, 'elt_allapot', true );
		update_post_meta( $id, 'elt_allapot', $status );
		self::log( $id, $source . ': ' . self::statuses()[ $status ], $data );
		if ( 'sikeres' === $status && 'sikeres' !== $old && ! get_post_meta( $id, 'elt_ertesitve', true ) ) {
			update_post_meta( $id, 'elt_ertesitve', 1 );
			self::notify( $id );
		}
	}

	protected static function notify( $id ) {
		$to = sanitize_email( (string) elt_setting( 'notify_email' ) );
		if ( ! $to ) {
			return;
		}
		$lines = array(
			'Új sikeres online adomány érkezett a SimplePay-en keresztül.',
			'',
			'Név: ' . get_post_meta( $id, 'elt_nev', true ),
			'E-mail: ' . get_post_meta( $id, 'elt_email', true ),
			'Összeg: ' . elt_format_ft( get_post_meta( $id, 'elt_osszeg', true ) ),
			'SimplePay azonosító: ' . get_post_meta( $id, 'elt_transaction_id', true ),
			'Rendelésazonosító: ' . get_post_meta( $id, 'elt_order_ref', true ),
			'',
			'Részletek: ' . admin_url( 'post.php?post=' . (int) $id . '&action=edit' ),
		);
		wp_mail( $to, 'Új online adomány – ' . elt_format_ft( get_post_meta( $id, 'elt_osszeg', true ) ), implode( "\n", $lines ) );
	}

	/* ------------------------------------------------------------------ IPN */

	public static function routes() {
		register_rest_route(
			'elt/v1',
			'/simplepay-ipn',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'handle_ipn' ),
				'permission_callback' => '__return_true', // Authenticated by the HMAC signature.
			)
		);
	}

	/**
	 * SimplePay Instant Payment Notification.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public static function handle_ipn( WP_REST_Request $request ) {
		$raw = (string) $request->get_body();
		if ( ! ELT_SimplePay::check_signature( $raw, (string) $request->get_header( 'signature' ) ) ) {
			return new WP_REST_Response( array( 'error' => 'invalid signature' ), 400 );
		}
		$ipn = json_decode( $raw, true );
		if ( ! is_array( $ipn ) || empty( $ipn['orderRef'] ) ) {
			return new WP_REST_Response( array( 'error' => 'invalid body' ), 400 );
		}

		$id = self::find_by_order_ref( $ipn['orderRef'] );
		if ( $id ) {
			if ( ! empty( $ipn['transactionId'] ) ) {
				update_post_meta( $id, 'elt_transaction_id', sanitize_text_field( (string) $ipn['transactionId'] ) );
			}
			$status = ELT_SimplePay::map_ipn_status( $ipn['status'] ?? '' );
			if ( $status ) {
				self::set_status( $id, $status, 'IPN (' . sanitize_text_field( (string) $ipn['status'] ) . ')', array_map( 'sanitize_text_field', array_filter( $ipn, 'is_scalar' ) ) );
			} else {
				self::log( $id, 'IPN: ' . sanitize_text_field( (string) ( $ipn['status'] ?? '?' ) ), array_map( 'sanitize_text_field', array_filter( $ipn, 'is_scalar' ) ) );
			}
		}

		list( $body, $signature ) = ELT_SimplePay::ipn_confirmation( $ipn );
		$response = new WP_REST_Response( array( '__elt_raw' => $body ), 200 );
		$response->header( 'Signature', $signature );
		$response->header( 'Content-Type', 'application/json; charset=utf-8' );
		return $response;
	}

	/**
	 * Output the IPN confirmation byte-for-byte as signed.
	 */
	public static function serve_raw_ipn( $served, $result, $request, $server ) {
		if ( self::IPN_ROUTE !== $request->get_route() || ! ( $result instanceof WP_REST_Response ) ) {
			return $served;
		}
		$data = $result->get_data();
		if ( ! is_array( $data ) || ! isset( $data['__elt_raw'] ) ) {
			return $served;
		}
		echo $data['__elt_raw']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		return true;
	}

	/* ------------------------------------------------------------ Result page */

	/**
	 * [elt_fizetes_eredmeny] – SimplePay back URL page with the mandatory texts.
	 */
	public static function result_shortcode() {
		// phpcs:disable WordPress.Security.NonceVerification
		// Keep base64 characters only ("+" may arrive as a space).
		$r = isset( $_GET['r'] ) ? preg_replace( '~[^A-Za-z0-9+/= ]~', '', (string) wp_unslash( $_GET['r'] ) ) : '';
		$s = isset( $_GET['s'] ) ? preg_replace( '~[^A-Za-z0-9+/= ]~', '', (string) wp_unslash( $_GET['s'] ) ) : '';
		// phpcs:enable

		if ( '' === $r ) {
			if ( current_user_can( 'edit_pages' ) ) {
				return '<div class="elt-result elt-result--info"><p><strong>Fizetés eredménye.</strong> Ide érkezik vissza az adományozó a SimplePay fizetés után; ez a doboz csak szerkesztőknek látszik, amíg nincs fizetési adat.</p></div>';
			}
			return '';
		}

		$back = ELT_SimplePay::parse_back( $r, $s );
		if ( ! $back ) {
			return '<div class="elt-result elt-result--fail"><p><strong>A fizetés eredményét nem sikerült ellenőrizni.</strong> Ha a kártyádat megterhelték, kérjük, írj nekünk.</p></div>';
		}

		$event = strtoupper( (string) ( $back['e'] ?? '' ) );
		$tid   = sanitize_text_field( (string) ( $back['t'] ?? '' ) );
		$id    = self::find_by_order_ref( (string) $back['o'] );
		if ( $id ) {
			if ( $tid ) {
				update_post_meta( $id, 'elt_transaction_id', $tid );
			}
			$status = ELT_SimplePay::map_back_event( $event );
			// The IPN is authoritative; only fill in the status if it has not arrived yet.
			if ( $status && 'fuggo' === get_post_meta( $id, 'elt_allapot', true ) ) {
				self::set_status( $id, $status, 'Visszairányítás (' . $event . ')', array( 't' => $tid ) );
			}
		}

		$tid_line = '<p>SimplePay tranzakcióazonosító: <strong>' . esc_html( $tid ) . '</strong></p>';
		switch ( $event ) {
			case 'SUCCESS':
				$html = '<div class="elt-result elt-result--success"><h3>Sikeres tranzakció.</h3>' . $tid_line . '<p>Köszönjük a támogatásodat! A visszaigazolást e-mailben is megkapod.</p></div>';
				break;
			case 'FAIL':
				$html = '<div class="elt-result elt-result--fail"><h3>Sikertelen tranzakció.</h3>' . $tid_line . '<p>Kérjük, ellenőrizd a tranzakció során megadott adatok helyességét. Amennyiben minden adatot helyesen adtál meg, a visszautasítás okának kivizsgálása érdekében kérjük, lépj kapcsolatba kártyakibocsátó bankoddal.</p></div>';
				break;
			case 'CANCEL':
				$html = '<div class="elt-result elt-result--cancel"><h3>Megszakított fizetés.</h3><p>Megszakítottad a fizetést, így a tranzakció nem jött létre. A kártyádat nem terheltük meg.</p></div>';
				break;
			case 'TIMEOUT':
				$html = '<div class="elt-result elt-result--cancel"><h3>Időtúllépés.</h3><p>Túllépted a tranzakció elindításának lehetséges maximális idejét, így a tranzakció nem jött létre. A kártyádat nem terheltük meg.</p></div>';
				break;
			default:
				$html = '<div class="elt-result elt-result--info">' . $tid_line . '</div>';
		}
		return apply_filters( 'elt_fizetes_eredmeny_html', $html, $event, $back );
	}

	/* ------------------------------------------------------------------ Admin */

	public static function columns( $columns ) {
		return array(
			'cb'           => $columns['cb'] ?? '',
			'title'        => 'Adományozó',
			'elt_email'    => 'E-mail',
			'elt_osszeg'   => 'Összeg',
			'elt_allapot'  => 'Állapot',
			'elt_sp_id'    => 'SimplePay azonosító',
			'date'         => 'Dátum',
		);
	}

	public static function column( $column, $post_id ) {
		switch ( $column ) {
			case 'elt_email':
				echo esc_html( get_post_meta( $post_id, 'elt_email', true ) );
				break;
			case 'elt_osszeg':
				echo esc_html( elt_format_ft( get_post_meta( $post_id, 'elt_osszeg', true ) ) );
				break;
			case 'elt_allapot':
				$status = get_post_meta( $post_id, 'elt_allapot', true );
				printf( '<span class="elt-badge elt-badge--don-%1$s">%2$s</span>', esc_attr( $status ), esc_html( self::statuses()[ $status ] ?? $status ) );
				if ( get_post_meta( $post_id, 'elt_sandbox', true ) ) {
					echo ' <small class="elt-muted">teszt</small>';
				}
				break;
			case 'elt_sp_id':
				echo esc_html( get_post_meta( $post_id, 'elt_transaction_id', true ) ?: '—' );
				break;
		}
	}

	public static function meta_boxes() {
		add_meta_box( 'elt_adomany_adatok', 'Adomány részletei', array( __CLASS__, 'box_details' ), ELT_DON, 'normal', 'high' );
	}

	public static function box_details( $post ) {
		$status = get_post_meta( $post->ID, 'elt_allapot', true );
		$rows   = array(
			'Állapot'             => self::statuses()[ $status ] ?? $status,
			'Név'                 => get_post_meta( $post->ID, 'elt_nev', true ),
			'E-mail'              => get_post_meta( $post->ID, 'elt_email', true ),
			'Összeg'              => elt_format_ft( get_post_meta( $post->ID, 'elt_osszeg', true ) ),
			'Rendelésazonosító'   => get_post_meta( $post->ID, 'elt_order_ref', true ),
			'SimplePay azonosító' => get_post_meta( $post->ID, 'elt_transaction_id', true ),
			'Teszt (sandbox)'     => get_post_meta( $post->ID, 'elt_sandbox', true ) ? 'igen' : 'nem',
		);
		echo '<table class="form-table elt-details"><tbody>';
		foreach ( $rows as $label => $value ) {
			printf( '<tr><th>%1$s</th><td>%2$s</td></tr>', esc_html( $label ), esc_html( $value ? $value : '—' ) );
		}
		$fields = get_post_meta( $post->ID, 'elt_mezok', true );
		if ( is_array( $fields ) ) {
			foreach ( $fields as $label => $value ) {
				printf( '<tr><th>%1$s</th><td>%2$s</td></tr>', esc_html( $label ), nl2br( esc_html( $value ) ) );
			}
		}
		echo '</tbody></table>';

		$log = get_post_meta( $post->ID, 'elt_naplo', true );
		if ( is_array( $log ) && $log ) {
			echo '<h4>Előzmények</h4><ul class="elt-log">';
			foreach ( $log as $entry ) {
				printf( '<li><code>%1$s</code> %2$s</li>', esc_html( $entry['ido'] ?? '' ), esc_html( $entry['uzenet'] ?? '' ) );
			}
			echo '</ul>';
		}
	}
}
