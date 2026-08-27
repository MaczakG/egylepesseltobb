(function () {
  "use strict";

  // Sticky header compact state
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

  // Mobile hamburger menu
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

  // Scroll reveal animations
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

  // Contact form (front-end only demo; wire to Contact Form 7 / SMTP on deploy)
  var form = document.getElementById("contact-form");
  var status = document.getElementById("form-status");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.textContent = "Köszönjük az üzeneted! Hamarosan válaszolunk.";
      form.reset();
    });
  }

  // Footer year
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
})();
