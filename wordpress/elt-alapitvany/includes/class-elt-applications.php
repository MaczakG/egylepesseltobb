<?php
/**
 * Applications ("jelentkezések") sent through the family application form.
 *
 * Every new application increases the family's applicant count by one and runs the
 * automatic status rule. Moving an application to the trash decreases the count
 * again (restoring it increases it), so spam can be cleaned up safely.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

class ELT_Applications {

	public static function init() {
		add_action( 'wp_trash_post', array( __CLASS__, 'on_trash' ) );
		add_action( 'before_delete_post', array( __CLASS__, 'on_trash' ) );
		add_action( 'untrashed_post', array( __CLASS__, 'on_untrash' ) );
		add_filter( 'wp_untrash_post_status', array( __CLASS__, 'untrash_status' ), 10, 3 );

		add_filter( 'manage_' . ELT_APP . '_posts_columns', array( __CLASS__, 'columns' ) );
		add_action( 'manage_' . ELT_APP . '_posts_custom_column', array( __CLASS__, 'column' ), 10, 2 );
		add_action( 'restrict_manage_posts', array( __CLASS__, 'family_filter' ) );
		add_action( 'pre_get_posts', array( __CLASS__, 'apply_family_filter' ) );
		add_action( 'add_meta_boxes_' . ELT_APP, array( __CLASS__, 'meta_boxes' ) );
	}

	/**
	 * Families that can currently be chosen in the application form.
	 *
	 * @param int $include_id Family to include even if it is already adopted.
	 * @return WP_Post[]
	 */
	public static function selectable_families( $include_id = 0 ) {
		$families = get_posts(
			array(
				'post_type'      => ELT_CPT,
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				'orderby'        => array(
					'menu_order' => 'ASC',
					'date'       => 'DESC',
				),
				'tax_query'      => array( // phpcs:ignore WordPress.DB.SlowDBQuery
					array(
						'taxonomy' => ELT_TAX,
						'field'    => 'slug',
						'terms'    => 'orokbefogadhato',
					),
				),
			)
		);
		if ( $include_id && ELT_CPT === get_post_type( $include_id ) && 'publish' === get_post_status( $include_id ) ) {
			$ids = wp_list_pluck( $families, 'ID' );
			if ( ! in_array( (int) $include_id, array_map( 'intval', $ids ), true ) ) {
				array_unshift( $families, get_post( $include_id ) );
			}
		}
		return $families;
	}

	/**
	 * Validate a family ID coming from a form.
	 *
	 * @param mixed $family_id Raw value.
	 * @return int|WP_Error
	 */
	public static function validate_family( $family_id ) {
		$family_id = absint( $family_id );
		if ( ! $family_id || ELT_CPT !== get_post_type( $family_id ) || 'publish' !== get_post_status( $family_id ) ) {
			return new WP_Error( 'elt_no_family', 'Kérjük, válassz egy családot a listából.' );
		}
		return $family_id;
	}

	/**
	 * Store an application and update the family.
	 *
	 * @param array $data { csalad_id, nev, email, telefon, uzenet, mezok }.
	 * @return int|WP_Error Application ID.
	 */
	public static function create( array $data ) {
		$family_id = self::validate_family( $data['csalad_id'] ?? 0 );
		if ( is_wp_error( $family_id ) ) {
			return $family_id;
		}
		$name  = sanitize_text_field( $data['nev'] ?? '' );
		$email = sanitize_email( $data['email'] ?? '' );

		$app_id = wp_insert_post(
			array(
				'post_type'   => ELT_APP,
				'post_status' => 'publish',
				'post_title'  => trim( ( '' !== $name ? $name : ( '' !== $email ? $email : 'Jelentkező' ) ) . ' – ' . get_the_title( $family_id ) ),
			),
			true
		);
		if ( is_wp_error( $app_id ) ) {
			return $app_id;
		}

		$fields = array();
		foreach ( (array) ( $data['mezok'] ?? array() ) as $label => $value ) {
			$fields[ sanitize_text_field( $label ) ] = sanitize_textarea_field( is_array( $value ) ? implode( ', ', $value ) : (string) $value );
		}

		update_post_meta( $app_id, 'elt_csalad_id', $family_id );
		update_post_meta( $app_id, 'elt_nev', $name );
		update_post_meta( $app_id, 'elt_email', $email );
		update_post_meta( $app_id, 'elt_telefon', sanitize_text_field( $data['telefon'] ?? '' ) );
		update_post_meta( $app_id, 'elt_uzenet', sanitize_textarea_field( $data['uzenet'] ?? '' ) );
		update_post_meta( $app_id, 'elt_mezok', $fields );
		update_post_meta( $app_id, 'elt_szamolva', 1 );
		$pledge = absint( $data['osszeg'] ?? 0 );
		update_post_meta( $app_id, 'elt_osszeg', $pledge );

		elt_set_applicants( $family_id, elt_get_applicants( $family_id ) + 1 );
		elt_set_pledged( $family_id, elt_get_pledged( $family_id ) + $pledge );
		do_action( 'elt_applicants_changed', $family_id );
		do_action( 'elt_application_created', $app_id, $family_id );

		return $app_id;
	}

	/**
	 * Trash / delete: give the family's count back.
	 *
	 * @param int $post_id Post ID.
	 */
	public static function on_trash( $post_id ) {
		if ( ELT_APP !== get_post_type( $post_id ) || ! get_post_meta( $post_id, 'elt_szamolva', true ) ) {
			return;
		}
		$family_id = (int) get_post_meta( $post_id, 'elt_csalad_id', true );
		update_post_meta( $post_id, 'elt_szamolva', 0 );
		if ( $family_id && ELT_CPT === get_post_type( $family_id ) ) {
			elt_set_applicants( $family_id, elt_get_applicants( $family_id ) - 1 );
			elt_set_pledged( $family_id, elt_get_pledged( $family_id ) - (int) get_post_meta( $post_id, 'elt_osszeg', true ) );
		}
	}

	/**
	 * Restore from trash: count it again.
	 *
	 * @param int $post_id Post ID.
	 */
	public static function on_untrash( $post_id ) {
		if ( ELT_APP !== get_post_type( $post_id ) || get_post_meta( $post_id, 'elt_szamolva', true ) ) {
			return;
		}
		$family_id = (int) get_post_meta( $post_id, 'elt_csalad_id', true );
		if ( $family_id && ELT_CPT === get_post_type( $family_id ) ) {
			update_post_meta( $post_id, 'elt_szamolva', 1 );
			elt_set_applicants( $family_id, elt_get_applicants( $family_id ) + 1 );
			elt_set_pledged( $family_id, elt_get_pledged( $family_id ) + (int) get_post_meta( $post_id, 'elt_osszeg', true ) );
			do_action( 'elt_applicants_changed', $family_id );
		}
	}

	/**
	 * Restored applications go back to "published" (WordPress would make them drafts).
	 */
	public static function untrash_status( $new_status, $post_id, $previous_status ) {
		return ELT_APP === get_post_type( $post_id ) ? $previous_status : $new_status;
	}

	public static function columns( $columns ) {
		return array(
			'cb'          => $columns['cb'] ?? '',
			'title'       => 'Jelentkező',
			'elt_osszeg'  => 'Havi felajánlás',
			'elt_email'   => 'E-mail',
			'elt_telefon' => 'Telefon',
			'elt_csalad'  => 'Család',
			'date'        => 'Dátum',
		);
	}

	public static function column( $column, $post_id ) {
		switch ( $column ) {
			case 'elt_email':
				$email = get_post_meta( $post_id, 'elt_email', true );
				echo $email ? '<a href="mailto:' . esc_attr( $email ) . '">' . esc_html( $email ) . '</a>' : '—';
				break;
			case 'elt_telefon':
				echo esc_html( get_post_meta( $post_id, 'elt_telefon', true ) ?: '—' );
				break;
			case 'elt_osszeg':
				$pledge = (int) get_post_meta( $post_id, 'elt_osszeg', true );
				echo $pledge ? esc_html( elt_format_ft( $pledge ) . ' / hó' ) : '—';
				break;
			case 'elt_csalad':
				$family_id = (int) get_post_meta( $post_id, 'elt_csalad_id', true );
				if ( $family_id && get_post( $family_id ) ) {
					printf( '<a href="%1$s">%2$s</a>', esc_url( get_edit_post_link( $family_id ) ), esc_html( get_the_title( $family_id ) ) );
				} else {
					echo '—';
				}
				break;
		}
	}

	public static function family_filter( $post_type ) {
		if ( ELT_APP !== $post_type ) {
			return;
		}
		$current  = isset( $_GET['elt_csalad'] ) ? absint( $_GET['elt_csalad'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification
		$families = get_posts(
			array(
				'post_type'      => ELT_CPT,
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		);
		echo '<select name="elt_csalad"><option value="">Összes család</option>';
		foreach ( $families as $family ) {
			printf( '<option value="%1$d"%2$s>%3$s</option>', (int) $family->ID, selected( $current, $family->ID, false ), esc_html( $family->post_title ) );
		}
		echo '</select>';
	}

	public static function apply_family_filter( $query ) {
		if ( ! is_admin() || ! $query->is_main_query() || ELT_APP !== $query->get( 'post_type' ) || empty( $_GET['elt_csalad'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
			return;
		}
		$query->set( 'meta_key', 'elt_csalad_id' );
		$query->set( 'meta_value', absint( $_GET['elt_csalad'] ) ); // phpcs:ignore WordPress.Security.NonceVerification
	}

	public static function meta_boxes() {
		add_meta_box( 'elt_jelentkezes_adatok', 'Beküldött adatok', array( __CLASS__, 'box_details' ), ELT_APP, 'normal', 'high' );
	}

	public static function box_details( $post ) {
		$family_id = (int) get_post_meta( $post->ID, 'elt_csalad_id', true );
		$rows      = array(
			'Család'  => $family_id && get_post( $family_id ) ? '<a href="' . esc_url( get_edit_post_link( $family_id ) ) . '">' . esc_html( get_the_title( $family_id ) ) . '</a>' : '—',
			'Név'     => esc_html( get_post_meta( $post->ID, 'elt_nev', true ) ),
			'E-mail'  => esc_html( get_post_meta( $post->ID, 'elt_email', true ) ),
			'Telefon' => esc_html( get_post_meta( $post->ID, 'elt_telefon', true ) ),
			'Havi felajánlás' => (int) get_post_meta( $post->ID, 'elt_osszeg', true ) ? esc_html( elt_format_ft( get_post_meta( $post->ID, 'elt_osszeg', true ) ) ) : '',
			'Üzenet'  => nl2br( esc_html( get_post_meta( $post->ID, 'elt_uzenet', true ) ) ),
		);
		echo '<table class="form-table elt-details"><tbody>';
		foreach ( $rows as $label => $html ) {
			printf( '<tr><th>%1$s</th><td>%2$s</td></tr>', esc_html( $label ), $html ? $html : '—' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}
		$fields = get_post_meta( $post->ID, 'elt_mezok', true );
		if ( is_array( $fields ) && $fields ) {
			echo '<tr><th colspan="2"><strong>Az űrlap összes mezője</strong></th></tr>';
			foreach ( $fields as $label => $value ) {
				printf( '<tr><th>%1$s</th><td>%2$s</td></tr>', esc_html( $label ), nl2br( esc_html( $value ) ) );
			}
		}
		echo '</tbody></table>';
		echo '<p class="description">Ha ezt a jelentkezést a lomtárba helyezed, a család jelentkezőszáma eggyel csökken. A státusz nem változik vissza magától.</p>';
	}
}
