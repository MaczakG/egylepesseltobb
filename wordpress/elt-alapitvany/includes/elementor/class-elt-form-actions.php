<?php
/**
 * Elementor Pro form actions ("Beküldés utáni műveletek").
 *
 * Loaded only when Elementor Pro's Action_Base class exists.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

use Elementor\Controls_Manager;
use ElementorPro\Modules\Forms\Classes\Action_Base;

/**
 * Családhoz jelentkezés (ELT): stores the application, +1 applicant, runs the rule.
 */
class ELT_Action_Application extends Action_Base {

	public function get_name() {
		return 'elt_jelentkezes';
	}

	public function get_label() {
		return 'Családhoz jelentkezés (ELT)';
	}

	public function register_settings_section( $widget ) {
		$widget->start_controls_section(
			'section_elt_jelentkezes',
			array(
				'label'     => 'Családhoz jelentkezés (ELT)',
				'condition' => array( 'submit_actions' => $this->get_name() ),
			)
		);
		$widget->add_control(
			'elt_jelentkezes_info',
			array(
				'type'            => Controls_Manager::RAW_HTML,
				'raw'             => 'A beküldött jelentkezés az <b>Alapítvány → Jelentkezések</b> menübe kerül, a kiválasztott család jelentkezőszáma eggyel nő, és lefut az automatikus státuszváltás.<br><br>Mezőazonosítók (Haladó → ID): <b>csalad</b> (legördülő lista – a plugin tölti fel), <b>nev</b> (vagy <b>vezeteknev</b> + <b>keresztnev</b>), <b>email</b>, <b>telefon</b>, <b>osszeg</b> (vállalt havi összeg), <b>uzenet</b>.',
				'content_classes' => 'elementor-descriptor',
			)
		);
		$widget->end_controls_section();
	}

	public function run( $record, $ajax_handler ) {
		$fields = (array) $record->get( 'fields' );
		$result = ELT_Applications::create(
			array(
				'csalad_id' => ELT_Elementor::field( $fields, ELT_Elementor::FAMILY_FIELD ),
				'nev'       => ELT_Elementor::applicant_name( $fields ),
				'email'     => ELT_Elementor::field( $fields, 'email', 'email' ),
				'telefon'   => ELT_Elementor::field( $fields, 'telefon', 'tel' ),
				'uzenet'    => ELT_Elementor::field( $fields, 'uzenet', 'textarea' ),
				'osszeg'    => (int) preg_replace( '/\D/', '', ELT_Elementor::field( $fields, 'osszeg' ) ),
				'mezok'     => ELT_Elementor::labelled_fields( $fields ),
			)
		);
		if ( is_wp_error( $result ) ) {
			$ajax_handler->add_error_message( $result->get_error_message() );
		}
	}

	public function on_export( $element ) {
		return $element;
	}
}

/**
 * SimplePay adomány (ELT): creates a donation and sends the visitor to SimplePay.
 */
class ELT_Action_SimplePay extends Action_Base {

	public function get_name() {
		return 'elt_simplepay';
	}

	public function get_label() {
		return 'SimplePay adomány (ELT)';
	}

	public function register_settings_section( $widget ) {
		$widget->start_controls_section(
			'section_elt_simplepay',
			array(
				'label'     => 'SimplePay adomány (ELT)',
				'condition' => array( 'submit_actions' => $this->get_name() ),
			)
		);
		$widget->add_control(
			'elt_simplepay_info',
			array(
				'type'            => Controls_Manager::RAW_HTML,
				'raw'             => 'Beküldéskor a látogató a SimplePay fizetőoldalára kerül, utána a beállított „Fizetés eredménye” oldalra tér vissza. Az adományok az <b>Alapítvány → Adományok</b> menüben látszanak. Kereskedői adatok: <b>Alapítvány → Beállítások</b>.<br><br>Mezőazonosítók: <b>osszeg</b> (pl. <code>5 000 Ft|5000</code>, egyedi: <code>Egyedi összeg|egyedi</code>), <b>egyedi_osszeg</b>, <b>nev</b>, <b>email</b>.<br><br>Ezt a műveletet tedd utolsónak a listában.',
				'content_classes' => 'elementor-descriptor',
			)
		);
		$widget->end_controls_section();
	}

	public function run( $record, $ajax_handler ) {
		if ( ! ELT_SimplePay::is_configured() ) {
			$ajax_handler->add_error_message( 'Az online fizetés jelenleg nem elérhető. Kérjük, támogass minket banki átutalással.' );
			return;
		}
		$fields = (array) $record->get( 'fields' );
		$amount = ELT_Elementor::donation_amount( $fields );
		$email  = ELT_Elementor::field( $fields, 'email', 'email' );

		$donation_id = ELT_Donations::create_pending(
			array(
				'nev'    => ELT_Elementor::field( $fields, 'nev', 'text' ),
				'email'  => $email,
				'osszeg' => $amount,
				'mezok'  => ELT_Elementor::labelled_fields( $fields ),
			)
		);
		if ( is_wp_error( $donation_id ) ) {
			$ajax_handler->add_error_message( 'A fizetés indítása nem sikerült. Kérjük, próbáld újra később.' );
			return;
		}

		$result = ELT_SimplePay::start(
			array(
				'order_ref' => get_post_meta( $donation_id, 'elt_order_ref', true ),
				'email'     => $email,
				'amount'    => $amount,
				'back_url'  => ELT_Donations::result_url(),
			)
		);

		if ( is_wp_error( $result ) || empty( $result['paymentUrl'] ) ) {
			$message = is_wp_error( $result ) ? $result->get_error_message() : 'Hiányzó paymentUrl.';
			ELT_Donations::set_status( $donation_id, 'hiba', 'Indítás', array( 'hiba' => $message ) );
			$ajax_handler->add_error_message( 'A fizetés indítása nem sikerült. Kérjük, próbáld újra később.' . ( current_user_can( 'manage_options' ) ? ' (' . $message . ')' : '' ) );
			return;
		}

		if ( ! empty( $result['transactionId'] ) ) {
			update_post_meta( $donation_id, 'elt_transaction_id', sanitize_text_field( (string) $result['transactionId'] ) );
		}
		ELT_Donations::log( $donation_id, 'Átirányítás a SimplePay oldalára', array( 'transactionId' => (string) ( $result['transactionId'] ?? '' ) ) );
		$ajax_handler->add_response_data( 'redirect_url', esc_url_raw( $result['paymentUrl'] ) );
	}

	public function on_export( $element ) {
		return $element;
	}
}
