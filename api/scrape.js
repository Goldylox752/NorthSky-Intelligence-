const previewCard = document.getElementById("previewCard");
const ogImageEl = document.getElementById("ogImage");
const screenshotEl = document.getElementById("screenshot");

previewCard.style.display = "block";

// OG IMAGE
if (data.ogImage) {
  ogImageEl.src = data.ogImage;
  ogImageEl.style.display = "block";
} else {
  ogImageEl.style.display = "none";
}

// SCREENSHOT
screenshotEl.src = getScreenshot(input);