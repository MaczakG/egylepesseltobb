<?php
/**
 * Automatic status change: when a family's applicant count reaches the threshold,
 * its status becomes the configured target status (default: Örökbefogadott).
 *
 * The rule runs when the applicant count changes (new application, manual edit,
 * restoring an application from the trash) and for every family when the settings
 * are saved – the same behaviour as the original admin mock.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

class ELT_Automation {

	public static function init() {
		add_action( 'elt_applicants_changed', array( __CLASS__, 'maybe_apply' ) );
		add_action( 'elt_status_changed', array( __CLASS__, 'flush_elementor_cache' ) );
	}

	/**
	 * Apply the rule to one family. Returns true if the status changed.
	 *
	 * @param int $post_id Family ID.
	 */
	public static function maybe_apply( $post_id ) {
		$settings = elt_settings();
		if ( empty( $settings['automation_enabled'] ) || ELT_CPT !== get_post_type( $post_id ) ) {
			return false;
		}
		if ( self::rule_met( $post_id, $settings ) ) {
			return elt_set_family_status( $post_id, $settings['auto_status'] );
		}
		return false;
	}

	/**
	 * Whether the family reached the threshold: applicant count (default) or pledged
	 * monthly sum ≥ the family's monthly target.
	 *
	 * @param int   $post_id  Family ID.
	 * @param array $settings Settings.
	 */
	public static function rule_met( $post_id, $settings = null ) {
		$settings = $settings ? $settings : elt_settings();
		if ( 'amount' === $settings['rule_basis'] ) {
			return elt_get_pledged( $post_id ) >= elt_family_target( $post_id );
		}
		return elt_get_applicants( $post_id ) >= max( 1, (int) $settings['threshold'] );
	}

	/**
	 * Apply the rule to every family. Returns the number of families that changed.
	 */
	public static function apply_all() {
		$ids     = get_posts(
			array(
				'post_type'      => ELT_CPT,
				'post_status'    => array( 'publish', 'draft', 'pending', 'private', 'future' ),
				'posts_per_page' => -1,
				'fields'         => 'ids',
			)
		);
		$changed = 0;
		foreach ( $ids as $id ) {
			if ( self::maybe_apply( $id ) ) {
				++$changed;
			}
		}
		return $changed;
	}

	/**
	 * A status change moves the family between the "adoptable" and "adopted" lists.
	 * Elementor renders loops dynamically, but a full-page cache (e.g. LiteSpeed Cache)
	 * would keep the old lists, so ask it to purge once at the end of the request.
	 */
	public static function flush_elementor_cache() {
		static $scheduled = false;
		if ( $scheduled ) {
			return;
		}
		$scheduled = true;
		add_action(
			'shutdown',
			function () {
				do_action( 'litespeed_purge_all' );
			}
		);
	}
}
