<?php
/**
 * Settings page: automatic status rule + SimplePay.
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

class ELT_Settings {

	const SLUG = 'elt-beallitasok';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_elt_save_settings', array( __CLASS__, 'save' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( ELT_FILE ), array( __CLASS__, 'action_links' ) );
	}

	public static function page_url() {
		return admin_url( 'edit.php?post_type=' . ELT_CPT . '&page=' . self::SLUG );
	}

	public static function action_links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( self::page_url() ) . '">Beállítások</a>' );
		return $links;
	}

	public static function menu() {
		add_submenu_page( 'edit.php?post_type=' . ELT_CPT, 'Beállítások', 'Beállítások', 'manage_options', self::SLUG, array( __CLASS__, 'render' ) );
	}

	public static function save() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Nincs jogosultságod ehhez.' );
		}
		check_admin_referer( 'elt_save_settings' );

		$old = elt_settings();
		$in  = wp_unslash( $_POST );

		$new                       = $old;
		$new['automation_enabled'] = empty( $in['automation_enabled'] ) ? 0 : 1;
		$new['threshold']          = max( 1, absint( $in['threshold'] ?? 6 ) );
		$new['auto_status']        = isset( elt_statuses()[ $in['auto_status'] ?? '' ] ) ? $in['auto_status'] : 'orokbefogadott';
		$new['notify_email']       = sanitize_email( $in['notify_email'] ?? '' );
		$new['sp_sandbox']         = empty( $in['sp_sandbox'] ) ? 0 : 1;
		$new['sp_merchant']        = sanitize_text_field( $in['sp_merchant'] ?? '' );
		$secret                    = trim( (string) ( $in['sp_secret'] ?? '' ) );
		if ( '' !== $secret ) {
			$new['sp_secret'] = sanitize_text_field( $secret );
		}
		if ( ! empty( $in['sp_secret_clear'] ) ) {
			$new['sp_secret'] = '';
		}
		$new['sp_result_page'] = absint( $in['sp_result_page'] ?? 0 );
		$new['sp_min_amount']  = max( 100, absint( $in['sp_min_amount'] ?? 500 ) );

		update_option( 'elt_beallitasok', $new );

		$changed = $new['automation_enabled'] ? ELT_Automation::apply_all() : 0;

		wp_safe_redirect(
			add_query_arg(
				array(
					'elt_mentve'   => 1,
					'elt_valtozas' => $changed,
				),
				self::page_url()
			)
		);
		exit;
	}

	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$s       = elt_settings();
		$saved   = ! empty( $_GET['elt_mentve'] ); // phpcs:ignore WordPress.Security.NonceVerification
		$changed = isset( $_GET['elt_valtozas'] ) ? absint( $_GET['elt_valtozas'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification
		?>
		<div class="wrap elt-settings">
			<h1>Beállítások</h1>
			<?php if ( $saved ) : ?>
				<div class="notice notice-success is-dismissible"><p>
					A beállítások mentve lettek.
					<?php if ( $changed ) : ?>
						<?php echo esc_html( sprintf( '%d család státusza automatikusan frissült.', $changed ) ); ?>
					<?php endif; ?>
				</p></div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="elt_save_settings">
				<?php wp_nonce_field( 'elt_save_settings' ); ?>

				<div class="elt-card">
					<h2>Automatikus státuszváltás</h2>
					<p class="description">Ez a szabály minden családra érvényes, és a jelentkezők számának változásakor automatikusan lefut (új jelentkezés, kézi módosítás). Mentéskor az összes családra lefut.</p>

					<label class="elt-toggle">
						<input type="checkbox" name="automation_enabled" value="1" <?php checked( $s['automation_enabled'] ); ?>>
						<span class="elt-toggle__track"><span class="elt-toggle__knob"></span></span>
						<span><strong>Automatizmus engedélyezése</strong><br><small>Ha ki van kapcsolva, a státuszt csak kézzel lehet módosítani.</small></span>
					</label>

					<p class="elt-rule">
						Ha egy család jelentkezőinek száma eléri a
						<input type="number" min="1" step="1" name="threshold" value="<?php echo esc_attr( $s['threshold'] ); ?>" class="small-text">
						főt, a státusza automatikusan
						<select name="auto_status">
							<?php foreach ( elt_statuses() as $slug => $label ) : ?>
								<option value="<?php echo esc_attr( $slug ); ?>" <?php selected( $s['auto_status'], $slug ); ?>><?php echo esc_html( $label ); ?></option>
							<?php endforeach; ?>
						</select>
						legyen.
					</p>
				</div>

				<div class="elt-card">
					<h2>SimplePay online adományozás</h2>
					<p class="description">A kereskedői adatokat a SimplePay kereskedői felületén (Technikai adatok) találod. Teszteléshez kapcsold be a teszt módot.</p>
					<table class="form-table" role="presentation">
						<tr>
							<th scope="row">Teszt mód (sandbox)</th>
							<td><label><input type="checkbox" name="sp_sandbox" value="1" <?php checked( $s['sp_sandbox'] ); ?>> sandbox.simplepay.hu használata (valódi terhelés nélkül)</label></td>
						</tr>
						<tr>
							<th scope="row"><label for="sp_merchant">Kereskedő azonosító (MERCHANT, HUF)</label></th>
							<td><input type="text" class="regular-text" id="sp_merchant" name="sp_merchant" value="<?php echo esc_attr( $s['sp_merchant'] ); ?>" autocomplete="off"></td>
						</tr>
						<tr>
							<th scope="row"><label for="sp_secret">Titkos kulcs (SECRET KEY)</label></th>
							<td>
								<input type="password" class="regular-text" id="sp_secret" name="sp_secret" value="" autocomplete="new-password" placeholder="<?php echo $s['sp_secret'] ? esc_attr( 'Mentve (' . str_repeat( '•', 8 ) . substr( $s['sp_secret'], -4 ) . ') – üresen hagyva marad' ) : ''; ?>">
								<?php if ( $s['sp_secret'] ) : ?>
									<br><label><input type="checkbox" name="sp_secret_clear" value="1"> Mentett kulcs törlése</label>
								<?php endif; ?>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="sp_result_page">Fizetés eredménye oldal</label></th>
							<td>
								<?php
								wp_dropdown_pages(
									array(
										'name'              => 'sp_result_page',
										'id'                => 'sp_result_page',
										'selected'          => (int) $s['sp_result_page'],
										'show_option_none'  => '— Válassz oldalt —',
										'option_none_value' => 0,
									)
								);
								?>
								<p class="description">Ha nincs kiválasztva, a „fizetes-eredmenye” című (slug) oldalt használja. Erre az oldalra tér vissza az adományozó. Az oldalon legyen ott a <code>[elt_fizetes_eredmeny]</code> rövidkód (a SimplePay által előírt üzenetekkel).</p>
							</td>
						</tr>
						<tr>
							<th scope="row">IPN URL</th>
							<td>
								<input type="text" class="large-text code" readonly value="<?php echo esc_attr( ELT_Donations::ipn_url() ); ?>" onclick="this.select()">
								<p class="description">Ezt az URL-t kell megadni a SimplePay kereskedői felületén IPN URL-ként. Ezen keresztül kapjuk meg a fizetések végleges eredményét.</p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="sp_min_amount">Legkisebb adomány</label></th>
							<td><input type="number" min="100" step="100" class="small-text" id="sp_min_amount" name="sp_min_amount" value="<?php echo esc_attr( $s['sp_min_amount'] ); ?>"> Ft</td>
						</tr>
						<tr>
							<th scope="row"><label for="notify_email">Értesítés sikeres adományról</label></th>
							<td><input type="email" class="regular-text" id="notify_email" name="notify_email" value="<?php echo esc_attr( $s['notify_email'] ); ?>"></td>
						</tr>
					</table>
					<p>
						Állapot:
						<?php if ( ELT_SimplePay::is_configured() ) : ?>
							<span class="elt-badge elt-badge--orokbefogadhato"><?php echo $s['sp_sandbox'] ? 'Beállítva – teszt mód' : 'Beállítva – éles mód'; ?></span>
						<?php else : ?>
							<span class="elt-badge">Nincs beállítva – az adomány űrlap hibaüzenetet ad</span>
						<?php endif; ?>
					</p>
				</div>

				<?php submit_button( 'Mentés' ); ?>
			</form>

			<div class="elt-card elt-card--help">
				<h2>Hogyan működik? (szerkesztési útmutató)</h2>
				<ol>
					<li><strong>Családok:</strong> Alapítvány → Családok. Név = cím, történet = szövegszerkesztő, kártyaszöveg = Kivonat, borítókép = Borítókép, galéria, alcím, havi összeg, jelentkezők és státusz a „Család adatai” dobozban.</li>
					<li><strong>Listák az oldalon:</strong> az Elementor <em>Loop Grid</em> widgetek a státusz szerint szűrnek (Lekérdezés → Tartalmazza → Kifejezés: Örökbefogadható / Örökbefogadott). A biztos szűrést a Lekérdezés azonosító (Query ID) adja: <code>elt_orokbefogadhato</code> vagy <code>elt_orokbefogadott</code>. Ha egy család státusza változik, magától átkerül a másik listába.</li>
					<li><strong>Jelentkezési űrlap:</strong> Elementor Pro űrlap, a „Beküldés utáni műveletek” között a <em>Családhoz jelentkezés (ELT)</em> művelettel. Mezőazonosítók (Haladó → ID): <code>csalad</code> (legördülő, a plugin tölti fel a családokkal és a család oldalán előre kiválasztja), <code>nev</code>, <code>email</code>, <code>telefon</code>, <code>uzenet</code>. Más oldalon a <code>?csalad=ID</code> paraméter választja ki előre a családot.</li>
					<li><strong>Adomány űrlap:</strong> Elementor Pro űrlap a <em>SimplePay adomány (ELT)</em> művelettel. Mezők: <code>osszeg</code> (választó, értékek pl. <code>5 000 Ft|5000</code>, egyedi összeghez <code>Egyedi összeg|egyedi</code>), <code>egyedi_osszeg</code> (szám), <code>nev</code>, <code>email</code>, valamint az adattovábbítási nyilatkozat (elfogadás mező).</li>
					<li><strong>Dinamikus címkék:</strong> Elementorban a „Egy Lépéssel Több” csoport: <em>Család adat</em> (alcím, státusz, havi összeg, gomb felirat…), <em>Család galéria</em>, <em>Jelentkezés link</em>.</li>
					<li><strong>Rövidkódok:</strong> <code>[elt_csalad mezo="alcim"]</code>, <code>[elt_fizetes_eredmeny]</code>.</li>
					<li><strong>Láthatóság a család oldalán:</strong> <code>elt-csak-orokbefogadhato</code> CSS osztályú elem csak örökbefogadható családnál, <code>elt-csak-orokbefogadott</code> csak örökbefogadottnál látszik.</li>
				</ol>
			</div>
		</div>
		<?php
	}
}
