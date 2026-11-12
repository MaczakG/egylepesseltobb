<?php
/**
 * Content types: families (+ status taxonomy), applications, donations.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

class ELT_Post_Types {

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ) );
		add_action( 'init', array( __CLASS__, 'ensure_terms' ), 20 );
		add_filter( 'use_block_editor_for_post_type', array( __CLASS__, 'classic_editor' ), 10, 2 );
	}

	/**
	 * Families use the classic editor (Visual / HTML tabs), like the original admin mock.
	 *
	 * @param bool   $use       Whether to use the block editor.
	 * @param string $post_type Post type.
	 */
	public static function classic_editor( $use, $post_type ) {
		return ELT_CPT === $post_type ? false : $use;
	}

	public static function register() {
		register_post_type(
			ELT_CPT,
			array(
				'labels'        => array(
					'name'               => 'Családok',
					'singular_name'      => 'Család',
					'menu_name'          => 'Alapítvány',
					'all_items'          => 'Családok',
					'add_new'            => 'Új család',
					'add_new_item'       => 'Új család hozzáadása',
					'edit_item'          => 'Család szerkesztése',
					'new_item'           => 'Új család',
					'view_item'          => 'Család megtekintése',
					'view_items'         => 'Családok megtekintése',
					'search_items'       => 'Keresés név alapján',
					'not_found'          => 'Nincs a szűrésnek megfelelő család.',
					'not_found_in_trash' => 'Nincs család a lomtárban.',
					'featured_image'     => 'Borítókép',
					'set_featured_image' => 'Borítókép beállítása',
					'remove_featured_image' => 'Borítókép eltávolítása',
					'use_featured_image' => 'Használat borítóképként',
					'item_published'     => 'A család közzé lett téve.',
					'item_updated'       => 'A módosítások mentve lettek.',
				),
				'public'        => true,
				'show_in_rest'  => true,
				'menu_icon'     => 'dashicons-groups',
				'menu_position' => 21,
				'supports'      => array( 'title', 'editor', 'thumbnail', 'excerpt', 'revisions' ),
				'has_archive'   => false,
				'rewrite'       => array(
					'slug'       => 'csalad',
					'with_front' => false,
				),
				'taxonomies'    => array( ELT_TAX ),
			)
		);

		register_taxonomy(
			ELT_TAX,
			array( ELT_CPT ),
			array(
				'labels'            => array(
					'name'          => 'Státuszok',
					'singular_name' => 'Státusz',
					'menu_name'     => 'Státuszok',
				),
				'public'            => true,
				'hierarchical'      => false,
				'show_ui'           => true,
				'show_in_menu'      => false,
				'show_in_nav_menus' => true,
				'show_in_rest'      => true,
				'show_admin_column' => false,
				'show_tagcloud'     => false,
				'meta_box_cb'       => false,
				'rewrite'           => array(
					'slug'       => 'csalad-statusz',
					'with_front' => false,
				),
				'capabilities'      => array(
					'manage_terms' => 'manage_options',
					'edit_terms'   => 'manage_options',
					'delete_terms' => 'do_not_allow',
					'assign_terms' => 'edit_posts',
				),
			)
		);

		$meta = array(
			'elt_alcim'        => array( 'string', 'sanitize_text_field' ),
			'elt_havi_osszeg'  => array( 'integer', 'absint' ),
			'elt_jelentkezok'  => array( 'integer', 'absint' ),
			'elt_galeria'      => array( 'string', array( __CLASS__, 'sanitize_ids' ) ),
			'elt_gomb_felirat' => array( 'string', 'sanitize_text_field' ),
		);
		foreach ( $meta as $key => $def ) {
			register_post_meta(
				ELT_CPT,
				$key,
				array(
					'type'              => $def[0],
					'single'            => true,
					'show_in_rest'      => true,
					'sanitize_callback' => $def[1],
					'auth_callback'     => function () {
						return current_user_can( 'edit_posts' );
					},
				)
			);
		}

		$private_type = array(
			'public'              => false,
			'publicly_queryable'  => false,
			'exclude_from_search' => true,
			'show_ui'             => true,
			'show_in_menu'        => 'edit.php?post_type=' . ELT_CPT,
			'show_in_rest'        => false,
			'supports'            => array( 'title' ),
			'capability_type'     => 'post',
			'capabilities'        => array( 'create_posts' => 'do_not_allow' ),
			'map_meta_cap'        => true,
			'rewrite'             => false,
		);

		register_post_type(
			ELT_APP,
			array_merge(
				$private_type,
				array(
					'labels' => array(
						'name'               => 'Jelentkezések',
						'singular_name'      => 'Jelentkezés',
						'all_items'          => 'Jelentkezések',
						'edit_item'          => 'Jelentkezés adatai',
						'search_items'       => 'Jelentkezések keresése',
						'not_found'          => 'Még nincs jelentkezés.',
						'not_found_in_trash' => 'Nincs jelentkezés a lomtárban.',
					),
				)
			)
		);

		register_post_type(
			ELT_DON,
			array_merge(
				$private_type,
				array(
					'labels' => array(
						'name'               => 'Adományok',
						'singular_name'      => 'Adomány',
						'all_items'          => 'Adományok (SimplePay)',
						'edit_item'          => 'Adomány adatai',
						'search_items'       => 'Adományok keresése',
						'not_found'          => 'Még nincs online adomány.',
						'not_found_in_trash' => 'Nincs adomány a lomtárban.',
					),
				)
			)
		);
	}

	/**
	 * Make sure both status terms exist.
	 */
	public static function ensure_terms() {
		if ( ! taxonomy_exists( ELT_TAX ) ) {
			return;
		}
		foreach ( elt_statuses() as $slug => $label ) {
			if ( ! term_exists( $slug, ELT_TAX ) ) {
				wp_insert_term( $label, ELT_TAX, array( 'slug' => $slug ) );
			}
		}
	}

	/**
	 * Sanitize a comma separated list of attachment IDs.
	 *
	 * @param mixed $value Raw value.
	 */
	public static function sanitize_ids( $value ) {
		return implode( ',', elt_parse_ids( $value ) );
	}
}
