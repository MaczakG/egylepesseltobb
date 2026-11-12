<?php
/**
 * Family editing screen and list table in wp-admin.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

class ELT_Family_Admin {

	public static function init() {
		add_action( 'add_meta_boxes_' . ELT_CPT, array( __CLASS__, 'meta_boxes' ) );
		add_action( 'save_post_' . ELT_CPT, array( __CLASS__, 'save' ), 10, 2 );
		add_action( 'rest_after_insert_' . ELT_CPT, array( __CLASS__, 'after_rest_insert' ), 10, 3 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );

		add_filter( 'manage_' . ELT_CPT . '_posts_columns', array( __CLASS__, 'columns' ) );
		add_action( 'manage_' . ELT_CPT . '_posts_custom_column', array( __CLASS__, 'column' ), 10, 2 );
		add_filter( 'views_edit-' . ELT_CPT, array( __CLASS__, 'status_views' ) );
		add_filter( 'enter_title_here', array( __CLASS__, 'title_placeholder' ), 10, 2 );
	}

	public static function title_placeholder( $text, $post ) {
		return ELT_CPT === $post->post_type ? 'Család / gyermek neve (pl. Kovács család)' : $text;
	}

	public static function assets( $hook ) {
		$screen = get_current_screen();
		if ( ! $screen || ! in_array( $screen->post_type, array( ELT_CPT, ELT_APP, ELT_DON ), true ) ) {
			if ( ! $screen || false === strpos( $screen->id, 'elt-beallitasok' ) ) {
				return;
			}
		}
		wp_enqueue_style( 'elt-admin', ELT_URL . 'assets/admin.css', array(), ELT_VERSION );
		if ( ELT_CPT === $screen->post_type && in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) {
			wp_enqueue_media();
			wp_enqueue_script( 'elt-admin', ELT_URL . 'assets/admin.js', array( 'jquery', 'jquery-ui-sortable' ), ELT_VERSION, true );
			$settings = elt_settings();
			wp_localize_script(
				'elt-admin',
				'ELT_ADMIN',
				array(
					'autoEnabled' => (bool) $settings['automation_enabled'],
					'threshold'   => max( 1, (int) $settings['threshold'] ),
					'autoStatus'  => $settings['auto_status'],
					'mediaTitle'  => 'Képek a család galériájához',
					'mediaButton' => 'Hozzáadás a galériához',
				)
			);
		}
	}

	public static function meta_boxes() {
		add_meta_box( 'elt_csalad_adatok', 'Család adatai', array( __CLASS__, 'box_details' ), ELT_CPT, 'normal', 'high' );
		add_meta_box( 'elt_csalad_galeria', 'Képek (galéria)', array( __CLASS__, 'box_gallery' ), ELT_CPT, 'normal', 'default' );
		add_meta_box( 'elt_csalad_jelentkezok', 'Jelentkezők', array( __CLASS__, 'box_applicants' ), ELT_CPT, 'normal', 'low' );
	}

	public static function box_details( $post ) {
		wp_nonce_field( 'elt_csalad_save', 'elt_csalad_nonce' );
		$status     = elt_get_family_status( $post->ID );
		$settings   = elt_settings();
		$threshold  = max( 1, (int) $settings['threshold'] );
		$applicants = elt_get_applicants( $post->ID );
		?>
		<div class="elt-fields">
			<div class="elt-field elt-field--wide">
				<label for="elt_alcim">Rövid alcím</label>
				<input type="text" id="elt_alcim" name="elt_alcim" value="<?php echo esc_attr( get_post_meta( $post->ID, 'elt_alcim', true ) ); ?>" placeholder="pl. 9 éves · Duchenne-féle izomdisztrófia">
			</div>

			<div class="elt-field">
				<span class="elt-label">Státusz</span>
				<div class="elt-seg" role="radiogroup" aria-label="Státusz">
					<?php foreach ( elt_statuses() as $slug => $label ) : ?>
						<label class="elt-seg__btn">
							<input type="radio" name="elt_statusz" value="<?php echo esc_attr( $slug ); ?>" <?php checked( $status, $slug ); ?>>
							<span><?php echo esc_html( $label ); ?></span>
						</label>
					<?php endforeach; ?>
				</div>
			</div>

			<div class="elt-field">
				<label for="elt_havi_osszeg">Havi támogatási összeg</label>
				<div class="elt-suffix">
					<input type="number" min="0" step="1000" id="elt_havi_osszeg" name="elt_havi_osszeg" value="<?php echo esc_attr( (int) get_post_meta( $post->ID, 'elt_havi_osszeg', true ) ?: '' ); ?>" placeholder="45000">
					<span>Ft</span>
				</div>
			</div>

			<div class="elt-field">
				<label for="elt_jelentkezok">Jelentkezők száma</label>
				<input type="number" min="0" step="1" id="elt_jelentkezok" name="elt_jelentkezok" value="<?php echo esc_attr( $applicants ); ?>" data-original="<?php echo esc_attr( $applicants ); ?>">
				<p class="elt-hint" id="elt-auto-hint" hidden>Automatikus szabály alapján javasolt státusz frissült.</p>
				<p class="description">
					<?php
					if ( $settings['automation_enabled'] ) {
						printf(
							'Automatikus státuszváltás: %1$d főnél → %2$s. Új jelentkezéskor a szám magától nő.',
							(int) $threshold,
							esc_html( elt_statuses()[ $settings['auto_status'] ] )
						);
					} else {
						echo 'Az automatikus státuszváltás ki van kapcsolva.';
					}
					?>
				</p>
			</div>

			<div class="elt-field elt-field--wide">
				<label for="elt_gomb_felirat">Gomb felirat a kártyán</label>
				<input type="text" id="elt_gomb_felirat" name="elt_gomb_felirat" value="<?php echo esc_attr( get_post_meta( $post->ID, 'elt_gomb_felirat', true ) ); ?>" placeholder="<?php echo esc_attr( elt_default_button_label( $post->ID ) ); ?>">
				<p class="description">Üresen hagyva automatikus (pl. „Segítek Noelnek”).</p>
			</div>
		</div>
		<p class="elt-help">
			<strong>Hol mit szerkessz?</strong>
			Borítókép = <em>Borítókép</em> doboz (jobb oldalt) · Kártyán megjelenő rövid szöveg = <em>Kivonat</em> · Teljes történet = fenti szövegszerkesztő (Vizuális / Szöveg fül a HTML forráshoz).
		</p>
		<?php
	}

	public static function box_gallery( $post ) {
		$ids = elt_gallery_ids( $post->ID );
		?>
		<input type="hidden" id="elt_galeria" name="elt_galeria" value="<?php echo esc_attr( implode( ',', $ids ) ); ?>">
		<ul class="elt-gallery" id="elt-gallery">
			<?php foreach ( $ids as $id ) : ?>
				<li data-id="<?php echo esc_attr( $id ); ?>">
					<?php echo wp_get_attachment_image( $id, 'thumbnail' ); ?>
					<button type="button" class="elt-gallery__remove" aria-label="Kép eltávolítása">×</button>
				</li>
			<?php endforeach; ?>
		</ul>
		<p>
			<button type="button" class="button" id="elt-gallery-add">Képek hozzáadása</button>
			<span class="description">Húzással rendezhető. A galéria a család oldalán jelenik meg.</span>
		</p>
		<?php
	}

	public static function box_applicants( $post ) {
		$apps = get_posts(
			array(
				'post_type'      => ELT_APP,
				'post_status'    => 'publish',
				'posts_per_page' => 50,
				'meta_key'       => 'elt_csalad_id', // phpcs:ignore WordPress.DB.SlowDBQuery
				'meta_value'     => $post->ID, // phpcs:ignore WordPress.DB.SlowDBQuery
			)
		);
		if ( ! $apps ) {
			echo '<p class="description">Ehhez a családhoz még nem érkezett jelentkezés az űrlapon keresztül.</p>';
			return;
		}
		echo '<table class="widefat striped elt-mini-table"><thead><tr><th>Név</th><th>E-mail</th><th>Telefon</th><th>Dátum</th></tr></thead><tbody>';
		foreach ( $apps as $app ) {
			printf(
				'<tr><td><a href="%1$s">%2$s</a></td><td>%3$s</td><td>%4$s</td><td>%5$s</td></tr>',
				esc_url( get_edit_post_link( $app->ID ) ),
				esc_html( get_post_meta( $app->ID, 'elt_nev', true ) ),
				esc_html( get_post_meta( $app->ID, 'elt_email', true ) ),
				esc_html( get_post_meta( $app->ID, 'elt_telefon', true ) ),
				esc_html( get_the_date( 'Y. m. d. H:i', $app ) )
			);
		}
		echo '</tbody></table>';
		printf(
			'<p><a href="%s">Összes jelentkezés ehhez a családhoz →</a></p>',
			esc_url( admin_url( 'edit.php?post_type=' . ELT_APP . '&elt_csalad=' . $post->ID ) )
		);
	}

	/**
	 * Save the meta box.
	 *
	 * @param int     $post_id Post ID.
	 * @param WP_Post $post    Post.
	 */
	public static function save( $post_id, $post ) {
		if ( wp_is_post_revision( $post_id ) || ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) ) {
			return;
		}
		if ( ! isset( $_POST['elt_csalad_nonce'] ) || ! wp_verify_nonce( sanitize_key( wp_unslash( $_POST['elt_csalad_nonce'] ) ), 'elt_csalad_save' ) ) {
			// Not saved from our screen (e.g. REST / quick edit): only make sure there is a status.
			if ( 'auto-draft' !== $post->post_status && ! elt_family_has_status( $post_id ) ) {
				elt_set_family_status( $post_id, 'orokbefogadhato' );
			}
			return;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		$old_count = elt_get_applicants( $post_id );

		update_post_meta( $post_id, 'elt_alcim', sanitize_text_field( wp_unslash( $_POST['elt_alcim'] ?? '' ) ) );
		update_post_meta( $post_id, 'elt_havi_osszeg', absint( $_POST['elt_havi_osszeg'] ?? 0 ) );
		update_post_meta( $post_id, 'elt_gomb_felirat', sanitize_text_field( wp_unslash( $_POST['elt_gomb_felirat'] ?? '' ) ) );
		update_post_meta( $post_id, 'elt_galeria', ELT_Post_Types::sanitize_ids( sanitize_text_field( wp_unslash( $_POST['elt_galeria'] ?? '' ) ) ) );

		$new_count = absint( $_POST['elt_jelentkezok'] ?? $old_count );
		elt_set_applicants( $post_id, $new_count );

		$status = sanitize_key( wp_unslash( $_POST['elt_statusz'] ?? 'orokbefogadhato' ) );
		elt_set_family_status( $post_id, isset( elt_statuses()[ $status ] ) ? $status : 'orokbefogadhato' );

		if ( $new_count !== $old_count ) {
			do_action( 'elt_applicants_changed', $post_id );
		}
	}

	/**
	 * Families created/updated through the REST API (e.g. imports): default status + rule.
	 *
	 * @param WP_Post         $post     Post.
	 * @param WP_REST_Request $request  Request.
	 * @param bool            $creating Whether this is a new post.
	 */
	public static function after_rest_insert( $post, $request, $creating ) {
		if ( ! elt_family_has_status( $post->ID ) ) {
			elt_set_family_status( $post->ID, 'orokbefogadhato' );
		}
		$meta = $request->get_param( 'meta' );
		if ( is_array( $meta ) && array_key_exists( 'elt_jelentkezok', $meta ) ) {
			do_action( 'elt_applicants_changed', $post->ID );
		}
	}

	public static function columns( $columns ) {
		$new = array();
		foreach ( $columns as $key => $label ) {
			if ( 'title' === $key ) {
				$new['elt_kep']         = '';
				$new['title']           = 'Család';
				$new['elt_statusz']     = 'Státusz';
				$new['elt_jelentkezok'] = 'Jelentkezők';
				$new['elt_osszeg']      = 'Havi összeg';
				continue;
			}
			if ( 'date' === $key ) {
				$new['date'] = 'Létrehozva';
				continue;
			}
			$new[ $key ] = $label;
		}
		return $new;
	}

	public static function column( $column, $post_id ) {
		switch ( $column ) {
			case 'elt_kep':
				$thumb = get_the_post_thumbnail( $post_id, array( 44, 44 ), array( 'class' => 'elt-thumb' ) );
				if ( $thumb ) {
					echo $thumb; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				} else {
					$title    = trim( get_the_title( $post_id ) );
					$initials = '';
					foreach ( preg_split( '/\s+/u', $title ) as $w ) {
						$initials .= mb_substr( $w, 0, 1 );
					}
					echo '<span class="elt-initials">' . esc_html( mb_strtoupper( mb_substr( $initials, 0, 2 ) ) ) . '</span>';
				}
				break;
			case 'elt_statusz':
				$status = elt_get_family_status( $post_id );
				printf( '<span class="elt-badge elt-badge--%1$s">%2$s</span>', esc_attr( $status ), esc_html( elt_statuses()[ $status ] ) );
				break;
			case 'elt_jelentkezok':
				$threshold = max( 1, (int) elt_setting( 'threshold' ) );
				$count     = elt_get_applicants( $post_id );
				$pct       = min( 100, (int) round( $count / $threshold * 100 ) );
				printf(
					'<div class="elt-progress"><strong>%1$d</strong><div><div class="elt-progress__bar"><span style="width:%2$d%%"></span></div><small>%1$d / %3$d fő küszöb</small></div></div>',
					(int) $count,
					(int) $pct,
					(int) $threshold
				);
				break;
			case 'elt_osszeg':
				$amount = (int) get_post_meta( $post_id, 'elt_havi_osszeg', true );
				echo $amount ? esc_html( elt_format_ft( $amount ) ) : '—';
				break;
		}
	}

	public static function status_views( $views ) {
		$base    = admin_url( 'edit.php?post_type=' . ELT_CPT );
		$current = isset( $_GET[ ELT_TAX ] ) ? sanitize_key( wp_unslash( $_GET[ ELT_TAX ] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		foreach ( elt_statuses() as $slug => $label ) {
			$term  = get_term_by( 'slug', $slug, ELT_TAX );
			$count = $term ? (int) $term->count : 0;
			$views[ 'elt_' . $slug ] = sprintf(
				'<a href="%1$s"%2$s>%3$s <span class="count">(%4$d)</span></a>',
				esc_url( add_query_arg( ELT_TAX, $slug, $base ) ),
				$current === $slug ? ' class="current" aria-current="page"' : '',
				esc_html( $label ),
				$count
			);
		}
		if ( $current && isset( $views['all'] ) ) {
			$views['all'] = str_replace( array( ' class="current"', ' aria-current="page"' ), '', $views['all'] );
		}
		return $views;
	}
}
