<?php
/**
 * Plugin Name:       Egy Lépéssel Több – Családok és adományok
 * Description:       Örökbefogadható családok kezelése, jelentkezések, automatikus státuszváltás és SimplePay online adományozás az Egy Lépéssel Több Alapítvány oldalához. Elementor Pro űrlap-műveletekkel és dinamikus címkékkel.
 * Version:           1.1.0
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Author:            Egy Lépéssel Több Alapítvány
 * Text Domain:       elt
 * License:           GPL-2.0-or-later
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

define( 'ELT_VERSION', '1.1.0' );
define( 'ELT_FILE', __FILE__ );
define( 'ELT_DIR', plugin_dir_path( __FILE__ ) );
define( 'ELT_URL', plugin_dir_url( __FILE__ ) );

define( 'ELT_CPT', 'elt_csalad' );
define( 'ELT_TAX', 'elt_statusz' );
define( 'ELT_APP', 'elt_jelentkezes' );
define( 'ELT_DON', 'elt_adomany' );

require_once ELT_DIR . 'includes/helpers.php';
require_once ELT_DIR . 'includes/class-elt-post-types.php';
require_once ELT_DIR . 'includes/class-elt-automation.php';
require_once ELT_DIR . 'includes/class-elt-family-admin.php';
require_once ELT_DIR . 'includes/class-elt-applications.php';
require_once ELT_DIR . 'includes/class-elt-simplepay.php';
require_once ELT_DIR . 'includes/class-elt-donations.php';
require_once ELT_DIR . 'includes/class-elt-settings.php';
require_once ELT_DIR . 'includes/class-elt-frontend.php';
require_once ELT_DIR . 'includes/elementor/class-elt-elementor.php';

ELT_Post_Types::init();
ELT_Automation::init();
ELT_Family_Admin::init();
ELT_Applications::init();
ELT_Donations::init();
ELT_Settings::init();
ELT_Frontend::init();
ELT_Elementor::init();

register_activation_hook( __FILE__, 'elt_activate' );
register_deactivation_hook( __FILE__, 'flush_rewrite_rules' );

/**
 * Activation: register types, create the two status terms, store defaults.
 */
function elt_activate() {
	ELT_Post_Types::register();
	ELT_Post_Types::ensure_terms();
	if ( false === get_option( 'elt_beallitasok', false ) ) {
		add_option( 'elt_beallitasok', elt_settings_defaults() );
	}
	flush_rewrite_rules();
}
