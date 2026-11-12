/* Egy Lépéssel Több – family edit screen helpers. */
(function ($) {
	'use strict';

	var cfg = window.ELT_ADMIN || {};

	// Automatic status hint (same behaviour as the original admin mock).
	var $count = $('#elt_jelentkezok');
	var $hint = $('#elt-auto-hint');
	$count.on('input change', function () {
		var n = parseInt(this.value, 10) || 0;
		if (cfg.autoEnabled && n >= cfg.threshold) {
			$('input[name="elt_statusz"][value="' + cfg.autoStatus + '"]').prop('checked', true).trigger('change');
			$hint.prop('hidden', false);
		} else {
			$hint.prop('hidden', true);
		}
	});

	// Gallery picker.
	var $input = $('#elt_galeria');
	var $list = $('#elt-gallery');

	function sync() {
		var ids = $list.children('li').map(function () { return $(this).data('id'); }).get();
		$input.val(ids.join(','));
	}

	if ($list.length && $.fn.sortable) {
		$list.sortable({ update: sync, tolerance: 'pointer' });
	}

	$list.on('click', '.elt-gallery__remove', function (e) {
		e.preventDefault();
		$(this).closest('li').remove();
		sync();
	});

	var frame = null;
	$('#elt-gallery-add').on('click', function (e) {
		e.preventDefault();
		if (!window.wp || !wp.media) { return; }
		if (!frame) {
			frame = wp.media({
				title: cfg.mediaTitle || 'Képek',
				button: { text: cfg.mediaButton || 'Hozzáadás' },
				library: { type: 'image' },
				multiple: 'add'
			});
			frame.on('select', function () {
				var existing = ($input.val() || '').split(',').filter(Boolean).map(Number);
				frame.state().get('selection').each(function (att) {
					var id = att.get('id');
					if (existing.indexOf(id) !== -1) { return; }
					var sizes = att.get('sizes') || {};
					var url = (sizes.thumbnail || sizes.medium || sizes.full || { url: att.get('url') }).url;
					var $li = $('<li/>').attr('data-id', id).data('id', id);
					$li.append($('<img/>').attr({ src: url, alt: '' }));
					$li.append('<button type="button" class="elt-gallery__remove" aria-label="Kép eltávolítása">×</button>');
					$list.append($li);
					existing.push(id);
				});
				sync();
			});
		}
		frame.open();
	});
})(jQuery);
