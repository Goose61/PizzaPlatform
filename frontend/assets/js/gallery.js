// Enhanced Gallery JavaScript - Based on Anime.js Gallery
// Crypto and $PIZZA token focused gallery

// jQuery fallback to prevent errors
if (typeof $ === 'undefined') {
  console.warn('jQuery not loaded - gallery functionality limited');
  window.$ = function() { 
    return { 
      on: function() { return this; },
      addClass: function() { return this; },
      removeClass: function() { return this; },
      each: function() { return this; },
      html: function() { return this; },
      text: function() { return this; },
      css: function() { return this; },
      show: function() { return this; },
      hide: function() { return this; },
      ready: function(fn) { if (typeof fn === 'function') setTimeout(fn, 100); }
    };
  };
}

// Anime.js fallback
if (typeof anime === 'undefined') {
  console.warn('Anime.js not loaded - animations disabled');
  window.anime = function() { 
    return { 
      add: function() { return this; },
      timeline: function() { return { add: function() { return this; } }; }
    };
  };
}

// Initialize HammerJS for touch gestures - Only on orbital ring
var orbitElement = document.querySelector('.gallery-container .bottom .orbit');
if (orbitElement && typeof Hammer !== 'undefined') {
  try {
    var hammertime = new Hammer(orbitElement);

    var swiped_top = false;

    // Only allow horizontal swipes for navigation and down swipe for closing modal
    hammertime.get('swipe').set({ direction: Hammer.DIRECTION_HORIZONTAL | Hammer.DIRECTION_DOWN });
    hammertime.on('swipeleft', function(ev) {
      cmove("prev");
    });
    hammertime.on('swiperight', function(ev) {
      cmove("next");
    });
    hammertime.on('swipedown', function(ev) {
      closemodal();
    });
  } catch (error) {
    console.warn('HammerJS not available:', error);
  }
} else {
  console.warn('HammerJS not loaded or orbit element not found');
}

// Action button clicks
$(".action").on("click", function(){
  cmove($(this).attr('id'));
});

// Initialize title animations
$('.title').each(function(){
  $(this).html("$PIZZA Ecosystem".replace(/([^\x00-\x80]|\w)/g, "<span class='letter'>$&</span>"));
});

// Initial title animation
anime.timeline({})
.add({
  targets: '.title',
  opacity: [0,1],
  easing: "easeOutExpo",
  duration: 100
})
.add({
  targets: '.title .letter',
  translateX: [40,0],
  translateZ: 0,
  opacity: [0,1],
  easing: "easeOutExpo",
  duration: 1200,
  delay: function(el, i) {
    return 500 + 30 * i;
  }
});

var angle = 0;
var planet_id = 0;

function cmove(dir){
  var n_planet = 9, next_id;
  var prev, next;
  var top = $("#pl"+ planet_id);
  var orbit = $(".planet_container");
  
  top.removeClass("pt");
  
  if(planet_id == 0){
    prev = $("#pl"+ (n_planet-1));
    next = $("#pl"+ (planet_id+1)%n_planet);
  }else{
    prev = $("#pl"+ (planet_id-1));
    next = $("#pl"+ (planet_id+1)%n_planet);
  }
  
  if(dir == "prev"){
    next_id = (planet_id + 1) % n_planet;
    angle -= 45;
    next.addClass("pt");
    planet_id++;
  }else{
    if(planet_id == 0){
      next_id = n_planet - 1;
      planet_id = n_planet - 1;
    }else{
      next_id = planet_id-1;
      --planet_id;
    }
    angle += 45;
    prev.addClass("pt");
  }
  
  $(".active").removeClass("active");
  $("#p" + planet_id).addClass("active");
  $(".info_back h1").text(pizza_ecosystem[next_id]);
  
  if(swiped_top){
    $('.info_back h1').each(function(){
      $(this).html(pizza_ecosystem[planet_id].replace(/([^\x00-\x80]|\w)/g, "<span class='letter'>$&</span>"));
    });
    
    anime.timeline({})
    .add({
      targets: '.info_back h1',
      opacity: [0,1],
      easing: "easeOutExpo",
      duration: 100
    })
    .add({
      targets: '.info_back h1 .letter',
      translateX: [40,0],
      translateZ: 0,
      opacity: [0,1],
      easing: "easeOutExpo",
      duration: 1200,
      delay: function(el, i) {
        return 500 + 30 * i;
      }
    });
  }
  
  $('.title').each(function(){
    $(this).html(pizza_ecosystem[next_id].replace(/([^\x00-\x80]|\w)/g, "<span class='letter'>$&</span>"));
  });
  
  anime.timeline({})
  .add({
    targets: '.title .letter',
    translateX: [40,0],
    translateZ: 0,
    opacity: [0,1],
    easing: "easeOutExpo",
    duration: 1200,
    delay: function(el, i) {
      return 500 + 30 * i;
    }
  });
  
  $('.pn').each(function(){
    $(this).html(pizza_ecosystem[next_id].replace(/([^\x00-\x80]|\w)/g, "<span class='letter'>$&</span>"));
  });
  
  anime.timeline({})
  .add({
    targets: '.pn .letter',
    translateX: [40,0],
    translateZ: 0,
    opacity: [0,1],
    easing: "easeOutExpo",
    duration: 1200,
    delay: function(el, i) {
      return 500 + 30 * i;
    }
  });
  
  var ani_dir = (dir == "next") ? "0%" : "100%";
  
  anime.timeline({})
  .add({
    targets: '.planet_photo',
    opacity: {
      value: [1,0]
    },
    duration: 350,
    easing: 'easeOutQuad',
    complete: function(anim){
      // Update the planet photo background image
      $(".planet_photo").css("background-image", "url(" + photo_pizza[next_id] +")");
    }
  })
  .add({
    targets: '.planet_photo',
    opacity: [0,1],
    duration: 350,
    easing: 'easeInQuad'
  });
  orbit.css("transform", "rotateZ(" + angle + "deg)");
}

// Menu functionality
$("#open_menu").on("click", function(){
  $(".menu").show();
});

$(".close").on("click", function(){
  $(".menu").hide();
});

$(".more").on("click", function(){
  swiped_top = true;
  openmodal();
});

function openmodal(){
  // Reset any existing modal state
  $('.carousel').css('transform', 'translateY(100%)');
  
  anime.timeline({})
  .add({
    targets: '.carousel',
    translateY: ["100%", 0],
    duration: 600,
    easing: 'easeOutQuad',
  });
  
  // Update the modal content with current planet data
  $('.info_back h1').each(function(){
    $(this).html(pizza_ecosystem[planet_id].replace(/([^\x00-\x80]|\w)/g, "<span class='letter'>$&</span>"));
  });
  
  // Update the modal content to show the correct item
  $(".active").removeClass("active");
  $("#p" + planet_id).addClass("active");
  
  // Update the planet photo to show the current planet's image
  $(".planet_photo").css("background-image", "url(" + photo_pizza[planet_id] +")");
  
  // Update the modal content with the correct planet data
  $(".info_back h1").text(pizza_ecosystem[planet_id]);
  
  anime.timeline({})
  .add({
    targets: '.info_back h1',
    opacity: [0,1],
    easing: "easeOutExpo",
    duration: 100
  })
  .add({
    targets: '.info_back h1 .letter',
    translateX: [40,0],
    translateZ: 0,
    opacity: [0,1],
    easing: "easeOutExpo",
    duration: 1200,
    delay: function(el, i) {
      return 500 + 30 * i;
    }
  });
  
  // Set modal as open
  swiped_top = true;
}

function closemodal(){
  anime.timeline({})
  .add({
    targets: '.carousel',
    translateY: [0, "100%"],
    duration: 600,
    easing: 'easeOutQuad',
  });
  
  // Reset modal state
  swiped_top = false;
}

// Pizza ecosystem data arrays
const photo_pizza = [
  "./assets/images/pizza/campaign-gallery/photo_1_2025-08-01_12-08-13.jpg",
  "./assets/images/pizza/campaign-gallery/photo_2_2025-08-01_12-08-13.jpg", 
  "./assets/images/pizza/campaign-gallery/photo_3_2025-08-01_12-08-13.jpg",
  "./assets/images/pizza/campaign-gallery/photo_4_2025-08-01_12-08-13.jpg",
  "./assets/images/pizza/campaign-gallery/photo_5_2025-08-01_12-08-13.jpg",
  "./assets/images/pizza/campaign-gallery/photo_6_2025-08-01_12-08-13.jpg",
  "./assets/images/pizza/campaign-gallery/image-11.jpg",
  "./assets/images/pizza/campaign-gallery/photo_8_2025-08-01_12-08-13.jpg",
  "./assets/images/pizza/campaign-gallery/photo_9_2025-08-01_12-08-13.jpg"
];

var pizza_ecosystem = [
  "$PIZZA Token",
  "Atomic Swaps", 
  "DeFi Rewards",
  "Community DAO",
  "Staking Protocol",
  "NFT Marketplace",
  "Cross-Chain Bridge",
  "Governance System",
  "Ecosystem Growth"
]; 

// Initialize gallery when page loads
$(document).ready(function() {
  // Gallery is now manual only
});