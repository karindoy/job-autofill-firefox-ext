/**
 * Just enough behaviour to make the demo form feel like the real product:
 * an accessible custom combobox, chip inputs and a live description
 * strength meter. No network, no storage.
 */
"use strict";
(() => {
  document.getElementById("resetDemo")?.addEventListener("click", () => location.reload());

  // Content scripts do not run on moz-extension:// pages. Make that
  // explicit instead of letting the demo silently appear "broken".
  if (location.protocol === "file:") {
    const notice = document.getElementById("demoNotice");
    if (notice) {
      notice.hidden = false;
      notice.textContent =
        "If autofill does nothing here, enable “Access file URLs” for the extension in about:addons → Permissions, or serve the folder with `python3 -m http.server 8000` and open http://localhost:8000/demo/form.html.";
    }
  }

  if (location.protocol === "moz-extension:") {
    const notice = document.getElementById("demoNotice");
    if (notice) {
      notice.hidden = false;
      notice.textContent =
        "You are viewing this through the extension. Run `python3 -m http.server 8000` in the job-autofill folder and open http://localhost:8000/demo/form.html so the content script can run.";
    }
  }

  /* Custom combobox ------------------------------------------------ */
  const combo = document.getElementById("pronounCombo");
  const list = document.getElementById("pronounList");
  const comboValue = combo.querySelector(".combo-value");

  const closeCombo = () => {
    list.hidden = true;
    combo.classList.remove("open");
    combo.setAttribute("aria-expanded", "false");
  };

  const openCombo = () => {
    list.hidden = false;
    combo.classList.add("open");
    combo.setAttribute("aria-expanded", "true");
  };

  combo.addEventListener("click", () => {
    if (list.hidden) openCombo();
    else closeCombo();
  });

  combo.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (list.hidden) openCombo();
      else closeCombo();
    } else if (event.key === "Escape") {
      closeCombo();
    }
  });

  list.addEventListener("click", (event) => {
    const option = event.target.closest("[role='option']");
    if (!option) return;
    comboValue.textContent = option.textContent.trim();
    comboValue.classList.remove("placeholder");
    closeCombo();
  });

  document.addEventListener("click", (event) => {
    if (!combo.contains(event.target) && !list.contains(event.target)) closeCombo();
  });

  /* Chips ---------------------------------------------------------- */
  const skillCount = document.getElementById("skillCount");

  const updateSkillCount = () => {
    const container = document.getElementById("positionSkills");
    if (!skillCount || !container) return;
    const count = container.querySelectorAll(".chip").length;
    skillCount.textContent = `${count} of 12 skills`;
  };

  const addChip = (container, value) => {
    const text = String(value || "").trim().replace(/^\+/, "").trim();
    if (!text) return;
    const exists = Array.from(container.querySelectorAll(".chip")).some(
      (chip) => chip.textContent.replace("×", "").trim().toLowerCase() === text.toLowerCase()
    );
    if (exists) return;
    if (container.querySelectorAll(".chip").length >= 12) return;
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.appendChild(document.createTextNode(`${text} `));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${text}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      chip.remove();
      updateSkillCount();
    });
    chip.appendChild(remove);
    container.appendChild(chip);
    updateSkillCount();
  };

  const wireChipInput = (inputId, containerId) => {
    const input = document.getElementById(inputId);
    const container = document.getElementById(containerId);
    if (!input || !container) return;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addChip(container, input.value);
        input.value = "";
      } else if (event.key === "Backspace" && !input.value) {
        container.querySelector(".chip:last-child")?.remove();
        updateSkillCount();
      }
    });
    input.addEventListener("blur", () => {
      if (input.value.trim()) {
        addChip(container, input.value);
        input.value = "";
      }
    });
  };

  wireChipInput("primarySkill", "primaryChips");
  wireChipInput("secondarySkill", "secondaryChips");
  wireChipInput("positionSkillInput", "positionSkills");

  document.querySelectorAll(".suggest").forEach((button) => {
    button.addEventListener("click", () => {
      addChip(document.getElementById("positionSkills"), button.dataset.skill);
      button.disabled = true;
      button.style.opacity = "0.45";
    });
  });

  const removeButtons = document.querySelectorAll(".chip button");
  removeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".chip")?.remove();
      updateSkillCount();
    });
  });

  updateSkillCount();

  /* Description strength ------------------------------------------- */
  const editor = document.getElementById("roleDescription");
  const bar = document.getElementById("strengthBar");
  const label = document.getElementById("strengthLabel");

  const updateStrength = () => {
    const text = (editor.textContent || "").trim();
    const words = text ? text.split(/\s+/).length : 0;
    const ratio = Math.min(1, words / 60);
    bar.style.width = `${Math.max(4, ratio * 100)}%`;
    if (words === 0) {
      label.textContent = "EMPTY";
      label.style.color = "var(--muted)";
      bar.style.background = "var(--line)";
    } else if (words < 15) {
      label.textContent = "WEAK";
      label.style.color = "#d97706";
      bar.style.background = "#d97706";
    } else if (words < 30) {
      label.textContent = "GOOD";
      label.style.color = "#2563eb";
      bar.style.background = "#2563eb";
    } else {
      label.textContent = "STRONG";
      label.style.color = "var(--green)";
      bar.style.background = "var(--green)";
    }
  };

  editor.addEventListener("input", updateStrength);
  updateStrength();
})();
