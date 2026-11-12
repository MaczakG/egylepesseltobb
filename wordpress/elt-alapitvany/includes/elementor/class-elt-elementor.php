<?php
/**
 * Elementor / Elementor Pro integration:
 * - dynamic tags (family data, family gallery, application link),
 * - form actions (application to a family, SimplePay donation),
 * - the "csalad" select field is filled with the adoptable families.
 *
 * Every hook only runs when Elementor (Pro) is active, so the plugin never breaks
 * the site without it.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

class ELT_Elementor {

	const FAMILY_FIELD = 'csalad';

	public static function init() {
		add_action( 'elementor/dynamic_tags/register', array( __CLASS__, 'register_tags' ) );
		add_action( 'elementor_pro/forms/actions/register', array( __CLASS__, 'register_actions' ) );
		add_filter( 'elementor_pro/forms/render/item/select', array( __CLASS__, 'populate_family_select' ), 10, 3 );
		add_action( 'elementor_pro/forms/validation', array( __CLASS__, 'validate' ), 10, 2 );
		add_filter( 'elementor/element/is_dynamic_content', array( __CLASS__, 'form_is_dynamic' ), 10, 2 );

		// Loop Grid → Lekérdezés → Lekérdezés azonosító (Query ID): elt_orokbefogadhato / elt_orokbefogadott.
		foreach ( array_keys( elt_statuses() ) as $status ) {
			add_action(
				'elementor/query/elt_' . $status,
				function ( $query ) use ( $status ) {
					self::filter_status_query( $query, $status );
				}
			);
		}
	}

	/**
	 * Forms with a "csalad" field depend on the page and on the current family list, so
	 * Elementor must not serve them from its element cache.
	 *
	 * @param bool  $is_dynamic Current value.
	 * @param array $raw        Raw element data.
	 */
	public static function form_is_dynamic( $is_dynamic, $raw = array() ) {
		if ( $is_dynamic || ! is_array( $raw ) || 'form' !== ( $raw['widgetType'] ?? '' ) ) {
			return $is_dynamic;
		}
		foreach ( (array) ( $raw['settings']['form_fields'] ?? array() ) as $field ) {
			if ( self::FAMILY_FIELD === ( $field['custom_id'] ?? '' ) ) {
				return true;
			}
		}
		return $is_dynamic;
	}

	/**
	 * Applicant name: "nev" field, or "vezeteknev" + "keresztnev".
	 *
	 * @param array $fields Record fields.
	 */
	public static function applicant_name( array $fields ) {
		$name = self::field( $fields, 'nev' );
		if ( '' === $name ) {
			$name = trim( self::field( $fields, 'vezeteknev' ) . ' ' . self::field( $fields, 'keresztnev' ) );
		}
		return '' !== $name ? $name : self::field( $fields, 'nev', 'text' );
	}

	/**
	 * Restrict a Loop Grid / Posts query to families of one status.
	 *
	 * @param WP_Query $query  Query.
	 * @param string   $status Status slug.
	 */
	public static function filter_status_query( $query, $status ) {
		$query->set( 'post_type', ELT_CPT );
		$query->set(
			'tax_query',
			array(
				array(
					'taxonomy' => ELT_TAX,
					'field'    => 'slug',
					'terms'    => $status,
				),
			)
		);
	}

	/**
	 * Family the current template is about: the loop/single post, a ?csalad= parameter,
	 * or the queried family page.
	 */
	public static function current_family_id() {
		$id = get_the_ID();
		if ( $id && ELT_CPT === get_post_type( $id ) ) {
			return (int) $id;
		}
		if ( is_singular( ELT_CPT ) ) {
			return (int) get_queried_object_id();
		}
		$param = isset( $_GET[ self::FAMILY_FIELD ] ) ? absint( $_GET[ self::FAMILY_FIELD ] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification
		if ( $param && ELT_CPT === get_post_type( $param ) ) {
			return $param;
		}
		return 0;
	}

	/**
	 * Preselected family of the application form: the family page itself or ?csalad=ID.
	 */
	protected static function preselected_family_id() {
		if ( is_singular( ELT_CPT ) ) {
			return (int) get_queried_object_id();
		}
		$param = isset( $_GET[ self::FAMILY_FIELD ] ) ? absint( $_GET[ self::FAMILY_FIELD ] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification
		if ( $param && ELT_CPT === get_post_type( $param ) ) {
			return $param;
		}
		$id = get_the_ID();
		return $id && ELT_CPT === get_post_type( $id ) ? (int) $id : 0;
	}

	/* ------------------------------------------------------------ Dynamic tags */

	/**
	 * @param \Elementor\Core\DynamicTags\Manager $manager Manager.
	 */
	public static function register_tags( $manager ) {
		require_once __DIR__ . '/class-elt-tags.php';
		$manager->register_group( 'elt', array( 'title' => 'Egy Lépéssel Több' ) );
		$manager->register( new ELT_Tag_Family_Field() );
		$manager->register( new ELT_Tag_Family_Gallery() );
		$manager->register( new ELT_Tag_Apply_Url() );
	}

	/* ------------------------------------------------------------ Form actions */

	/**
	 * @param object $registrar Elementor Pro form actions registrar.
	 */
	public static function register_actions( $registrar ) {
		if ( ! class_exists( '\ElementorPro\Modules\Forms\Classes\Action_Base' ) ) {
			return;
		}
		require_once __DIR__ . '/class-elt-form-actions.php';
		$registrar->register( new ELT_Action_Application() );
		$registrar->register( new ELT_Action_SimplePay() );
	}

	/**
	 * Fill the select field with ID "csalad" with the adoptable families and preselect
	 * the current family.
	 *
	 * @param array  $item   Field settings.
	 * @param int    $index  Field index.
	 * @param object $widget Form widget.
	 */
	public static function populate_family_select( $item, $index = 0, $widget = null ) {
		if ( ! is_array( $item ) || self::FAMILY_FIELD !== ( $item['custom_id'] ?? '' ) ) {
			return $item;
		}
		$current = self::preselected_family_id();
		$lines   = array( 'Válassz családot…|' );
		foreach ( ELT_Applications::selectable_families( $current ) as $family ) {
			$label   = trim( str_replace( array( '|', "\n", "\r" ), array( '/', ' ', ' ' ), wp_strip_all_tags( get_the_title( $family ) ) ) );
			$lines[] = $label . '|' . (int) $family->ID;
		}
		$item['field_options'] = implode( "\n", $lines );
		$item['field_value']   = $current ? (string) $current : '';
		return $item;
	}

	/**
	 * Field value by custom ID, falling back to the first field of a given type.
	 *
	 * @param array  $fields   Record fields.
	 * @param string $id       Custom ID.
	 * @param string $fallback Field type to fall back to.
	 */
	public static function field( array $fields, $id, $fallback = '' ) {
		if ( isset( $fields[ $id ] ) ) {
			$value = $fields[ $id ]['raw_value'] ?? ( $fields[ $id ]['value'] ?? '' );
			return is_array( $value ) ? implode( ', ', $value ) : trim( (string) $value );
		}
		if ( $fallback ) {
			foreach ( $fields as $field ) {
				if ( ( $field['type'] ?? '' ) === $fallback ) {
					$value = $field['raw_value'] ?? ( $field['value'] ?? '' );
					return is_array( $value ) ? implode( ', ', $value ) : trim( (string) $value );
				}
			}
		}
		return '';
	}

	/**
	 * All submitted fields as label => value (for the admin record).
	 *
	 * @param array $fields Record fields.
	 */
	public static function labelled_fields( array $fields ) {
		$out = array();
		foreach ( $fields as $id => $field ) {
			$label         = ! empty( $field['title'] ) ? $field['title'] : $id;
			$out[ $label ] = $field['value'] ?? '';
		}
		return $out;
	}

	/**
	 * Amount chosen in a donation form (preset or custom).
	 *
	 * @param array $fields Record fields.
	 */
	public static function donation_amount( array $fields ) {
		$choice = preg_replace( '/\D/', '', self::field( $fields, 'osszeg' ) );
		if ( '' !== $choice ) {
			return (int) $choice;
		}
		return (int) preg_replace( '/\D/', '', self::field( $fields, 'egyedi_osszeg' ) );
	}

	/**
	 * Validate forms that use our actions before any action runs.
	 *
	 * @param object $record       Form record.
	 * @param object $ajax_handler Ajax handler.
	 */
	public static function validate( $record, $ajax_handler ) {
		$actions = (array) $record->get_form_settings( 'submit_actions' );
		$fields  = (array) $record->get( 'fields' );

		if ( in_array( 'elt_jelentkezes', $actions, true ) ) {
			$check = ELT_Applications::validate_family( self::field( $fields, self::FAMILY_FIELD ) );
			if ( is_wp_error( $check ) ) {
				if ( isset( $fields[ self::FAMILY_FIELD ] ) ) {
					$ajax_handler->add_error( self::FAMILY_FIELD, $check->get_error_message() );
				} else {
					$ajax_handler->add_error_message( 'Az űrlapból hiányzik a „csalad” azonosítójú családválasztó mező.' );
				}
			}
		}

		if ( in_array( 'elt_simplepay', $actions, true ) ) {
			$min    = max( 100, (int) elt_setting( 'sp_min_amount' ) );
			$amount = self::donation_amount( $fields );
			if ( $amount < $min ) {
				$preset = preg_replace( '/\D/', '', self::field( $fields, 'osszeg' ) );
				$target = ( '' === $preset && isset( $fields['egyedi_osszeg'] ) ) ? 'egyedi_osszeg' : 'osszeg';
				$msg    = sprintf( 'A legkisebb adomány %s.', elt_format_ft( $min ) );
				if ( isset( $fields[ $target ] ) ) {
					$ajax_handler->add_error( $target, $msg );
				} else {
					$ajax_handler->add_error_message( $msg );
				}
			}
			if ( ! is_email( self::field( $fields, 'email', 'email' ) ) ) {
				if ( isset( $fields['email'] ) ) {
					$ajax_handler->add_error( 'email', 'Kérjük, adj meg egy érvényes e-mail címet.' );
				} else {
					$ajax_handler->add_error_message( 'Kérjük, adj meg egy érvényes e-mail címet.' );
				}
			}
		}
	}
}
