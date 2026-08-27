(function () {
  "use strict";

  // Sticky header shadow state
  var header = document.getElementById("site-header");
  var onScroll = function () {
    if (window.scrollY > 24) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  };
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobil hamburger menü
  var hamburger = document.getElementById("hamburger");
  var mobileNav = document.getElementById("mobile-nav");
  hamburger.addEventListener("click", function () {
    var isOpen = mobileNav.classList.toggle("is-open");
    hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
  mobileNav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      mobileNav.classList.remove("is-open");
      hamburger.setAttribute("aria-expanded", "false");
    });
  });

  // Nyelvválasztó — CSAK VIZUÁLIS MINTA ELEM.
  // Ez csak az aktív állapotot váltja, valós fordítást nem végez; ebben a
  // verzióban minden tartalom magyarul jelenik meg (lásd a briefet). Éles
  // indulás előtt kösd be a tényleges i18n logikát, ha kétnyelvű oldal kell.
  var langButtons = document.querySelectorAll(".lang-btn");
  langButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      langButtons.forEach(function (b) {
        b.classList.remove("is-active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
    });
  });

  // Scroll reveal animációk
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  // Lábléc évszám
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
})();
