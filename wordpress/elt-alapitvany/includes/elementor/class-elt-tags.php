<?php
/**
 * Elementor dynamic tags ("Egy Lépéssel Több" group).
 *
 * @package ELT
 */

defined( 'ABSPATH' ) || exit;

use Elementor\Controls_Manager;
use Elementor\Core\DynamicTags\Data_Tag;
use Elementor\Core\DynamicTags\Tag;
use Elementor\Modules\DynamicTags\Module as Tags;

/**
 * Család adat – alcím, státusz, havi összeg, gomb felirat, …
 */
class ELT_Tag_Family_Field extends Tag {

	public function get_name() {
		return 'elt-csalad-adat';
	}

	public function get_title() {
		return 'Család adat';
	}

	public function get_group() {
		return 'elt';
	}

	public function get_categories() {
		return array( Tags::TEXT_CATEGORY, Tags::POST_META_CATEGORY );
	}

	protected function register_controls() {
		$this->add_control(
			'mezo',
			array(
				'label'   => 'Mező',
				'type'    => Controls_Manager::SELECT,
				'default' => 'alcim',
				'options' => elt_family_field_choices(),
			)
		);
	}

	public function render() {
		echo esc_html( elt_family_field( ELT_Elementor::current_family_id(), (string) $this->get_settings( 'mezo' ) ) );
	}
}

/**
 * Család galéria – a család képei (opcionálisan a borítóképpel kezdve).
 */
class ELT_Tag_Family_Gallery extends Data_Tag {

	public function get_name() {
		return 'elt-csalad-galeria';
	}

	public function get_title() {
		return 'Család galéria';
	}

	public function get_group() {
		return 'elt';
	}

	public function get_categories() {
		return array( Tags::GALLERY_CATEGORY );
	}

	protected function register_controls() {
		$this->add_control(
			'boritokep',
			array(
				'label'        => 'Borítókép is legyen benne',
				'type'         => Controls_Manager::SWITCHER,
				'default'      => '',
				'return_value' => 'yes',
			)
		);
	}

	public function get_value( array $options = array() ) {
		$id  = ELT_Elementor::current_family_id();
		$ids = $id ? elt_gallery_ids( $id ) : array();
		if ( $id && 'yes' === $this->get_settings( 'boritokep' ) ) {
			$thumb = (int) get_post_thumbnail_id( $id );
			if ( $thumb ) {
				$ids = array_values( array_unique( array_merge( array( $thumb ), $ids ) ) );
			}
		}
		return array_map(
			function ( $attachment_id ) {
				return array( 'id' => $attachment_id );
			},
			$ids
		);
	}
}

/**
 * Jelentkezés link – a család oldala az űrlaphoz görgetve (#jelentkezes).
 */
class ELT_Tag_Apply_Url extends Data_Tag {

	public function get_name() {
		return 'elt-jelentkezes-url';
	}

	public function get_title() {
		return 'Jelentkezés link';
	}

	public function get_group() {
		return 'elt';
	}

	public function get_categories() {
		return array( Tags::URL_CATEGORY );
	}

	protected function register_controls() {
		$this->add_control(
			'horgony',
			array(
				'label'   => 'Horgony',
				'type'    => Controls_Manager::TEXT,
				'default' => '#jelentkezes',
			)
		);
	}

	public function get_value( array $options = array() ) {
		$id = ELT_Elementor::current_family_id();
		if ( ! $id ) {
			return '';
		}
		$anchor = trim( (string) $this->get_settings( 'horgony' ) );
		if ( '' !== $anchor && '#' !== $anchor[0] ) {
			$anchor = '#' . $anchor;
		}
		return get_permalink( $id ) . $anchor;
	}
}
