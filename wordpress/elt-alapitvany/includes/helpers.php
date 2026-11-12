<?php
/**
 * Shared helpers: settings, statuses, counters, formatting.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

/**
 * Default plugin settings.
 */
function elt_settings_defaults() {
	return array(
		'automation_enabled' => 1,
		'rule_basis'         => 'count',
		'threshold'          => 6,
		'default_target'     => 50000,
		'auto_status'        => 'orokbefogadott',
		'notify_email'       => get_option( 'admin_email' ),
		'sp_sandbox'         => 1,
		'sp_merchant'        => '',
		'sp_secret'          => '',
		'sp_result_page'     => 0,
		'sp_min_amount'      => 500,
	);
}

/**
 * All settings merged with defaults.
 */
function elt_settings() {
	$saved = get_option( 'elt_beallitasok', array() );
	return wp_parse_args( is_array( $saved ) ? $saved : array(), elt_settings_defaults() );
}

/**
 * One setting value.
 *
 * @param string $key Setting key.
 */
function elt_setting( $key ) {
	$settings = elt_settings();
	return isset( $settings[ $key ] ) ? $settings[ $key ] : null;
}

/**
 * Family statuses: slug => label.
 */
function elt_statuses() {
	return array(
		'orokbefogadhato' => 'Örökbefogadható',
		'orokbefogadott'  => 'Örökbefogadott',
	);
}

/**
 * Current status slug of a family (defaults to adoptable).
 *
 * @param int $post_id Family ID.
 */
function elt_get_family_status( $post_id ) {
	$slugs = wp_get_object_terms( $post_id, ELT_TAX, array( 'fields' => 'slugs' ) );
	if ( ! is_wp_error( $slugs ) ) {
		foreach ( $slugs as $slug ) {
			if ( isset( elt_statuses()[ $slug ] ) ) {
				return $slug;
			}
		}
	}
	return 'orokbefogadhato';
}

/**
 * Whether the family has a valid status term assigned at all.
 *
 * @param int $post_id Family ID.
 */
function elt_family_has_status( $post_id ) {
	$slugs = wp_get_object_terms( $post_id, ELT_TAX, array( 'fields' => 'slugs' ) );
	return ! is_wp_error( $slugs ) && (bool) array_intersect( $slugs, array_keys( elt_statuses() ) );
}

/**
 * Set the status of a family. Returns true when the status actually changed.
 *
 * @param int    $post_id Family ID.
 * @param string $status  Status slug.
 */
function elt_set_family_status( $post_id, $status ) {
	if ( ! isset( elt_statuses()[ $status ] ) ) {
		return false;
	}
	$had = elt_family_has_status( $post_id );
	$old = elt_get_family_status( $post_id );
	if ( $had && $old === $status ) {
		return false;
	}
	$term = get_term_by( 'slug', $status, ELT_TAX );
	if ( ! $term ) {
		ELT_Post_Types::ensure_terms();
		$term = get_term_by( 'slug', $status, ELT_TAX );
	}
	if ( ! $term ) {
		return false;
	}
	wp_set_object_terms( $post_id, array( (int) $term->term_id ), ELT_TAX, false );
	clean_post_cache( $post_id );
	do_action( 'elt_status_changed', $post_id, $status, $had ? $old : '' );
	return true;
}

/**
 * Number of applicants of a family.
 *
 * @param int $post_id Family ID.
 */
function elt_get_applicants( $post_id ) {
	return max( 0, (int) get_post_meta( $post_id, 'elt_jelentkezok', true ) );
}

/**
 * Store the number of applicants.
 *
 * @param int $post_id Family ID.
 * @param int $count   New count.
 */
function elt_set_applicants( $post_id, $count ) {
	update_post_meta( $post_id, 'elt_jelentkezok', max( 0, (int) $count ) );
}

/**
 * Sum of the monthly amounts pledged in applications for a family.
 *
 * @param int $post_id Family ID.
 */
function elt_get_pledged( $post_id ) {
	return max( 0, (int) get_post_meta( $post_id, 'elt_felajanlott', true ) );
}

/**
 * Store the pledged sum.
 *
 * @param int $post_id Family ID.
 * @param int $amount  New sum.
 */
function elt_set_pledged( $post_id, $amount ) {
	update_post_meta( $post_id, 'elt_felajanlott', max( 0, (int) $amount ) );
}

/**
 * Monthly target of a family: its own "havi támogatási összeg", or the default target.
 *
 * @param int $post_id Family ID.
 */
function elt_family_target( $post_id ) {
	$own = (int) get_post_meta( $post_id, 'elt_havi_osszeg', true );
	return $own > 0 ? $own : max( 1, (int) elt_setting( 'default_target' ) );
}

/**
 * "45 000 Ft" with non-breaking spaces.
 *
 * @param int|string $amount Amount in HUF.
 */
function elt_format_ft( $amount ) {
	$nbsp = "\xC2\xA0";
	return number_format( (int) $amount, 0, ',', $nbsp ) . $nbsp . 'Ft';
}

/**
 * Hungarian dative ("-nak/-nek") form of a name, e.g. Kamilla → Kamillának, Noel → Noelnek.
 *
 * @param string $word Word.
 */
function elt_hu_dative( $word ) {
	$word = trim( $word );
	if ( '' === $word ) {
		return $word;
	}
	$back    = array( 'a', 'á', 'o', 'ó', 'u', 'ú' );
	$front   = array( 'e', 'é', 'ö', 'ő', 'ü', 'ű' );
	$chars   = preg_split( '//u', mb_strtolower( $word ), -1, PREG_SPLIT_NO_EMPTY );
	$suffix  = 'nek';
	for ( $i = count( $chars ) - 1; $i >= 0; $i-- ) {
		$c = $chars[ $i ];
		if ( in_array( $c, $back, true ) ) {
			$suffix = 'nak';
			break;
		}
		if ( in_array( $c, $front, true ) ) {
			$suffix = 'nek';
			break;
		}
		// i/í: neutral – keep looking at the previous vowel.
	}
	$last = mb_substr( $word, -1 );
	if ( 'a' === $last ) {
		$word = mb_substr( $word, 0, -1 ) . 'á';
	} elseif ( 'e' === $last ) {
		$word = mb_substr( $word, 0, -1 ) . 'é';
	}
	return $word . $suffix;
}

/**
 * Default call-to-action text of a family card, e.g. "Segítek Noelnek".
 *
 * @param int $post_id Family ID.
 */
function elt_default_button_label( $post_id ) {
	$title = trim( wp_strip_all_tags( get_the_title( $post_id ) ) );
	// "F. Noel" → "Noel".
	$title = trim( preg_replace( '/^(\p{Lu}\.\s*)+/u', '', $title ) );
	if ( '' === $title ) {
		return 'Segítek';
	}
	if ( preg_match( '/család$/u', mb_strtolower( $title ) ) ) {
		return 'Segítek a ' . elt_hu_dative( $title );
	}
	$words = preg_split( '/\s+/u', $title );
	$last  = array_pop( $words );
	$words[] = elt_hu_dative( $last );
	return 'Segítek ' . implode( ' ', $words );
}

/**
 * Card button label (custom or default).
 *
 * @param int $post_id Family ID.
 */
function elt_button_label( $post_id ) {
	$custom = trim( (string) get_post_meta( $post_id, 'elt_gomb_felirat', true ) );
	return '' !== $custom ? $custom : elt_default_button_label( $post_id );
}

/**
 * Gallery attachment IDs of a family.
 *
 * @param int $post_id Family ID.
 */
function elt_gallery_ids( $post_id ) {
	return elt_parse_ids( get_post_meta( $post_id, 'elt_galeria', true ) );
}

/**
 * "1, 2,3" → [1,2,3] (existing attachments only).
 *
 * @param string|array $value Raw value.
 */
function elt_parse_ids( $value ) {
	if ( is_array( $value ) ) {
		$value = implode( ',', $value );
	}
	$ids = array_filter( array_map( 'absint', explode( ',', (string) $value ) ) );
	$ids = array_values( array_unique( $ids ) );
	return array_values(
		array_filter(
			$ids,
			function ( $id ) {
				return 'attachment' === get_post_type( $id );
			}
		)
	);
}

/**
 * Family-field value used by the Elementor dynamic tag and the [elt_csalad] shortcode.
 *
 * @param int    $post_id Family ID.
 * @param string $field   Field key.
 */
function elt_family_field( $post_id, $field ) {
	if ( ! $post_id || ELT_CPT !== get_post_type( $post_id ) ) {
		return '';
	}
	$threshold = max( 1, (int) elt_setting( 'threshold' ) );
	switch ( $field ) {
		case 'alcim':
			return (string) get_post_meta( $post_id, 'elt_alcim', true );
		case 'statusz':
			return elt_statuses()[ elt_get_family_status( $post_id ) ];
		case 'statusz_slug':
			return elt_get_family_status( $post_id );
		case 'havi_osszeg':
			$amount = (int) get_post_meta( $post_id, 'elt_havi_osszeg', true );
			return $amount ? elt_format_ft( $amount ) : '';
		case 'havi_osszeg_szam':
			return (string) (int) get_post_meta( $post_id, 'elt_havi_osszeg', true );
		case 'jelentkezok':
			return (string) elt_get_applicants( $post_id );
		case 'kuszob':
			return (string) $threshold;
		case 'hianyzo':
			return (string) max( 0, $threshold - elt_get_applicants( $post_id ) );
		case 'felajanlott':
			return elt_format_ft( elt_get_pledged( $post_id ) );
		case 'cel':
			return elt_format_ft( elt_family_target( $post_id ) );
		case 'hianyzo_osszeg':
			return elt_format_ft( max( 0, elt_family_target( $post_id ) - elt_get_pledged( $post_id ) ) );
		case 'gomb_felirat':
			return elt_button_label( $post_id );
	}
	return '';
}

/**
 * Field choices for the dynamic tag / shortcode.
 */
function elt_family_field_choices() {
	return array(
		'alcim'            => 'Rövid alcím',
		'statusz'          => 'Státusz',
		'havi_osszeg'      => 'Havi támogatási összeg (formázott)',
		'havi_osszeg_szam' => 'Havi támogatási összeg (szám)',
		'jelentkezok'      => 'Jelentkezők száma',
		'kuszob'           => 'Jelentkezési küszöb',
		'hianyzo'          => 'Hiányzó jelentkezők száma',
		'felajanlott'      => 'Felajánlott havi összeg (összesen)',
		'cel'              => 'Havi cél (támogatási összeg)',
		'hianyzo_osszeg'   => 'Hiányzó havi összeg',
		'gomb_felirat'     => 'Gomb felirat (pl. Segítek Noelnek)',
	);
}
