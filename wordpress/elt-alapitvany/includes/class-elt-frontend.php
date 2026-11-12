<?php
/**
 * Front end: body classes, shortcodes, small stylesheet.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

class ELT_Frontend {

	public static function init() {
		add_filter( 'body_class', array( __CLASS__, 'body_class' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_shortcode( 'elt_csalad', array( __CLASS__, 'family_shortcode' ) );
	}

	/**
	 * On a family page: elt-csalad-orokbefogadhato / elt-csalad-orokbefogadott.
	 * Not added inside the Elementor editor, so every block stays visible there.
	 *
	 * @param string[] $classes Body classes.
	 */
	public static function body_class( $classes ) {
		if ( is_singular( ELT_CPT ) && ! self::is_elementor_preview() ) {
			$classes[] = 'elt-csalad-' . elt_get_family_status( get_queried_object_id() );
		}
		return $classes;
	}

	public static function is_elementor_preview() {
		return isset( $_GET['elementor-preview'] ) // phpcs:ignore WordPress.Security.NonceVerification
			|| ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->preview ) && \Elementor\Plugin::$instance->preview->is_preview_mode() );
	}

	public static function assets() {
		wp_enqueue_style( 'elt-front', ELT_URL . 'assets/front.css', array(), ELT_VERSION );
	}

	/**
	 * [elt_csalad mezo="alcim" id="123"]
	 *
	 * @param array $atts Attributes.
	 */
	public static function family_shortcode( $atts ) {
		$atts = shortcode_atts(
			array(
				'mezo' => 'alcim',
				'id'   => 0,
			),
			$atts,
			'elt_csalad'
		);
		$id   = absint( $atts['id'] );
		if ( ! $id ) {
			$id = ELT_Elementor::current_family_id();
		}
		return esc_html( elt_family_field( $id, sanitize_key( $atts['mezo'] ) ) );
	}
}
