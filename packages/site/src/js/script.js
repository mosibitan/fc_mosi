$(document).ready(function () {
  "use strict";
  // Sticky Nav
  $(window).on("scroll", function () {
    var windscroll = $(window).scrollTop();
    if (windscroll >= 100) {
      $("#mainnavigationBar").addClass("sticky-nav");
    } else {
      $("#mainnavigationBar").removeClass("sticky-nav");
    }
  });

  $(".navbar-toggler").on("click", function () {
    var navbar = $("#mainnavigationBar");
    navbar.toggleClass("bg-nav");
  });

  //Copyright Year
  var copyrightYear = document.getElementById("copyrightYear");
  copyrightYear.innerHTML = new Date().getFullYear();

  // Video Replace from data attribute
  $(".video-button").on("click", function () {
    var video = '<iframe allowfullscreen src="' + $(this).attr("data-video") + '"></iframe>';
    $(this).replaceWith(video);
  });

  //  AOS Initialize
  AOS.init();

  // Background Shape Switches
  TweenMax.fromTo(".switch", 2, {opacity: 1}, {opacity: 0.3, repeat: -1, yoyo: true, ease: Power2.easeInOut});
  TweenMax.fromTo(".switch-two", 2, {y: 0}, {y: 10, repeat: -1, yoyo: true, ease: Power2.easeInOut});
  TweenMax.fromTo(".switch-three", 2, {x: 0}, {x: 10, repeat: -1, yoyo: true, ease: Power2.easeInOut});

  // Magnific Popup
  $(".popup-vimeo").magnificPopup({
    disableOn: 700,
    type: "iframe",
    mainClass: "mfp-fade",
    removalDelay: 160,
    preloader: false,
    fixedContentPos: false,
  });

  // counter-up
  $(".counter").counterUp({});
  //masnary load more option
  var $grid = $(".grid").masonry({
    itemSelector: ".grid-item",
    columnWidth: ".review-item",
    percentPosition: true,
  });

  $(".load-more").on("click", function () {
    // create new item elements
    var $items = $(".hidden").removeClass("hidden");
    //append items to grid
    $grid
      .append($items)
      // add and lay out newly appended items
      .masonry("appended", $items);
    //hide button on expanded mood
    $(this).hide();
  });

  //Show password
  $(".viewPassword").click(function () {
    $(this).toggleClass("fa-eye fa-eye-slash");
    var input = $($(this).attr("toggle"));
    if (input.attr("type") == "password") {
      input.attr("type", "text");
    } else {
      input.attr("type", "password");
    }
  });
});

$(window).on("load", function () {
  var $grid = $(".grid").masonry({
    itemSelector: ".grid-item",
    columnWidth: ".review-item",
    percentPosition: true,
  });

  $(".load-more").on("click", function () {
    // create new item elements
    var $items = $(".hidden").removeClass("hidden");
    //append items to grid
    $grid
      .append($items)
      // add and lay out newly appended items
      .masonry("appended", $items);
    //hide button on expanded mood
    $(this).hide();
  });

  const animationDelay = 3600
  const lettersDelay = 180
  
  const words = document.getElementsByClassName("word")
  
  Array.prototype.forEach.call(words, word => wrapLetters(word) )
  animateWords(words)
  
  function wrapLetters(wordEl) {
    let letters = wordEl.innerText.split("")
    const visible = wordEl.classList.contains("visible")
    for (let i in letters) {
      letters[i] = visible
        ? '<i class="in">' + letters[i] + '</i>'
        : '<i class="out">' + letters[i] + '</i>';
    }
    const wrappedLetters = letters.join("")
    wordEl.innerHTML = wrappedLetters
  }
  
  
  function animateWords(wordsEl) {
    Array.prototype.forEach.call(wordsEl, wordEl => {
      if (wordEl.classList.contains("visible")) {
        setTimeout(() => {
          toggleWord(wordEl)
        }, animationDelay)
      }
    })
  }
  
  function toggleWord(wordEl) {
    const nextWordEl = nextEl(wordEl);
    const nextWordIsShorter = wordEl.childNodes.length >= nextWordEl.childNodes.length
  
    hideLetter(wordEl.firstChild, wordEl, nextWordIsShorter);
    showLetter(nextWordEl.firstChild, nextWordEl, nextWordIsShorter);
  
  }
  
  function hideLetter(letterEl, wordEl, nextWordIsShorter) {
    letterEl.classList.remove("in")
    letterEl.classList.add("out");
  
    if (letterEl != letterEl.parentNode.lastElementChild) {
      setTimeout(function () {
        hideLetter(letterEl.nextSibling, wordEl, nextWordIsShorter);
      }, lettersDelay);
    } else if (nextWordIsShorter) {
      setTimeout(function () {
        toggleWord(nextEl(wordEl));
      }, animationDelay);
    }
    if (letterEl == letterEl.parentNode.lastElementChild) {
      var nextWordEl = nextEl(wordEl);
      switchEl(wordEl, nextWordEl);
    }
  }
  function showLetter(letterEl, wordEl, nextWordIsShorter) {
    letterEl.classList.add("in");
    letterEl.classList.remove("out")
  
    if (letterEl != letterEl.parentNode.lastElementChild) {
      setTimeout(function () {
        showLetter(letterEl.nextSibling, wordEl, nextWordIsShorter);
      }, lettersDelay);
    } else {
      if (!nextWordIsShorter) {
        setTimeout(function () {
          toggleWord(wordEl);
        }, animationDelay);
      }
    }
  }
  
  function nextEl(el) {
    return el.nextElementSibling
      ? el.nextElementSibling
      : el.parentNode.firstElementChild
  }
  
  function switchEl(oldEl, newEl) {
    oldEl.classList.remove("visible")
    oldEl.classList.add("hidden")
    newEl.classList.remove("hidden")
    newEl.classList.add("visible")
  }  
});
