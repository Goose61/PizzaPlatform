// Pizza Builder - Cross-Platform Implementation
const pizzaContainer = document.getElementById('pizza-container');
const pizzaSection = document.querySelector('.pizza-builder-section');
const crust = document.getElementById('crust');
const sauce = document.getElementById('sauce');
const cheese = document.getElementById('cheese');
const toppings = document.getElementById('toppings');

// Layer info elements
const crustInfo = document.getElementById('crust-info');
const sauceInfo = document.getElementById('sauce-info');
const cheeseInfo = document.getElementById('cheese-info');
const toppingsInfo = document.getElementById('toppings-info');

function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
}

function animatePizza(progress) {
    // Opacity of whole container
    pizzaContainer.style.opacity = progress > 0 ? '1' : '0';

    // Crust layer
    const crustProgress = clamp(progress / 0.25, 0, 1);
    crust.style.opacity = crustProgress;
    crust.style.transform = `scale(${0.8 + 0.2 * crustProgress})`;
    
    // Show crust info when crust is building
    if (crustProgress > 0.5) {
        crustInfo.classList.add('active');
    } else {
        crustInfo.classList.remove('active');
    }

    // Sauce layer
    const sauceProgress = clamp((progress - 0.25) / 0.25, 0, 1);
    sauce.style.opacity = sauceProgress;
    sauce.style.transform = `scale(${0.8 + 0.2 * sauceProgress})`;
    
    // Show sauce info when sauce is building
    if (sauceProgress > 0.5) {
        sauceInfo.classList.add('active');
    } else {
        sauceInfo.classList.remove('active');
    }

    // Cheese layer
    const cheeseProgress = clamp((progress - 0.5) / 0.25, 0, 1);
    cheese.style.opacity = cheeseProgress;
    cheese.style.transform = `scale(${0.8 + 0.2 * cheeseProgress})`;
    
    // Show cheese info when cheese is building
    if (cheeseProgress > 0.5) {
        cheeseInfo.classList.add('active');
    } else {
        cheeseInfo.classList.remove('active');
    }

    // Toppings layer
    const toppingsProgress = clamp((progress - 0.75) / 0.25, 0, 1);
    toppings.style.opacity = toppingsProgress;
    toppings.style.transform = `scale(${0.8 + 0.2 * toppingsProgress})`;
    
    // Show toppings info when toppings are building
    if (toppingsProgress > 0.5) {
        toppingsInfo.classList.add('active');
    } else {
        toppingsInfo.classList.remove('active');
    }

    return toppingsProgress === 1;
}

// Scroll control variables
let buildProgress = 0;
let isInPizzaSection = false;
let isPizzaBuilt = false;
let hasCompletedBuildOnce = false;

// Touch variables for mobile support
let touchStartY = 0;
let touchStartProgress = 0;
let isTouchDevice = false;

// Wheel event handler for precise control (desktop)
function handleWheel(e) {
    // If not in pizza section or already built, do nothing
    if (!isInPizzaSection || hasCompletedBuildOnce) return;

    // Prevent default scrolling
    e.preventDefault();

    // Adjust build progress based on wheel delta
    buildProgress += e.deltaY > 0 ? 0.05 : -0.05;
    buildProgress = clamp(buildProgress, 0, 1);

    // Check if pizza is fully built
    isPizzaBuilt = animatePizza(buildProgress);

    // If fully built, mark as completed
    if (isPizzaBuilt) {
        hasCompletedBuildOnce = true;
    }

    // If scrolled back to beginning, reset
    if (buildProgress <= 0) {
        isPizzaBuilt = false;
    }
}

// Scroll event to detect pizza section
window.addEventListener('scroll', (e) => {
    const sectionRect = pizzaSection.getBoundingClientRect();
    
    // Check if pizza section is in view
    const newIsInPizzaSection = 
        sectionRect.top <= 0 && 
        sectionRect.bottom >= 0;

    if (newIsInPizzaSection && !isInPizzaSection) {
        // Entering pizza section
        if (!hasCompletedBuildOnce) {
            isInPizzaSection = true;
            isPizzaBuilt = false;
            buildProgress = 0;
            animatePizza(buildProgress);
            
            // Scroll to top of pizza section
            window.scrollTo(0, pizzaSection.offsetTop);
        }
    }
    else if (!newIsInPizzaSection) {
        // Outside pizza section
        isInPizzaSection = false;
        
        if (hasCompletedBuildOnce) {
            // Fully built, allow normal scrolling
            animatePizza(1);
        } else {
            // Reset if not fully built
            buildProgress = 0;
            animatePizza(buildProgress);
        }
    }
});

// Touch event handlers for mobile support
function handleTouchStart(e) {
    if (!isInPizzaSection || hasCompletedBuildOnce) return;
    
    touchStartY = e.touches[0].clientY;
    touchStartProgress = buildProgress;
}

function handleTouchMove(e) {
    if (!isInPizzaSection || hasCompletedBuildOnce) return;
    
    e.preventDefault();
    
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY - touchY;
    
    // Adjust build progress based on touch movement
    buildProgress = touchStartProgress + (deltaY / 200); // Adjust sensitivity
    buildProgress = clamp(buildProgress, 0, 1);
    
    // Check if pizza is fully built
    isPizzaBuilt = animatePizza(buildProgress);
    
    // If fully built, mark as completed
    if (isPizzaBuilt) {
        hasCompletedBuildOnce = true;
    }
}

// Detect touch device
function detectTouchDevice() {
    isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// Prevent default scroll behavior in pizza section
window.addEventListener('wheel', handleWheel, { passive: false });

// Add touch event listeners for mobile
window.addEventListener('touchstart', handleTouchStart, { passive: false });
window.addEventListener('touchmove', handleTouchMove, { passive: false });

// Initialize
detectTouchDevice();
animatePizza(0); 