// ===== PRODUCTION-GRADE VALIDATION ENGINE =====

const validators = {
  studentId: (id) => /^[A-Za-z0-9\-]{3,20}$/.test(String(id || '').trim()),
  name: (name) => /^[A-Za-z\s]{2,100}$/.test(String(name || '').trim()),
  email: (email) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(String(email || '').trim()),
  phone: (phone) => /^(\+92|0|92)[0-9]{9,12}$/.test(String(phone || '').replace(/[\s\-\(\)]/g, '')),
  amount: (amount) => !isNaN(amount) && Number(amount) > 0 && Number(amount) < 10000000,
  marks: (marks) => !isNaN(marks) && Number(marks) >= 0 && Number(marks) <= 100,
  cls: (cls) => /^[0-9A-Za-z\- ]{1,20}$/.test(String(cls || '').trim()),
  required: (value) => value !== null && value !== undefined && String(value).trim().length > 0,
  isEmpty: (value) => !value || String(value).trim() === "",
  isSafe: (text) => !/<script|onerror|onload|javascript:/i.test(String(text)) // Basic XSS check
};

const errorMessages = {
  studentId: "Student ID must be 3-20 alphanumeric characters",
  name: "Name must be 2-100 letters only (no numbers/symbols)",
  email: "Please enter a valid email address (e.g. name@school.edu)",
  phone: "Enter a valid phone number (e.g. 03001234567 or +92...)",
  amount: "Amount must be a positive number up to 10,000,000",
  marks: "Marks must be between 0 and 100",
  cls: "Class format is invalid (1-20 alphanumeric characters)",
  required: "This field is mandatory",
  unsafe: "Invalid characters detected. Please remove scripts or HTML tags."
};

/**
 * Validates a single field and returns error message or null
 */
function validateField(name, value, rules = {}) {
  if (rules.required && validators.isEmpty(value)) {
    return errorMessages.required;
  }
  
  if (validators.isEmpty(value)) return null;

  if (!validators.isSafe(value)) {
    return errorMessages.unsafe;
  }

  if (rules.type && validators[rules.type]) {
    if (!validators[rules.type](value)) {
      return errorMessages[rules.type] || `Invalid ${name}`;
    }
  }

  return null;
}

/**
 * Validates an entire form object against a schema
 */
function validateForm(data, schema) {
  const errors = {};
  let isValid = true;

  schema.forEach(field => {
    const value = data[field.name];
    const error = validateField(field.name, value, field);
    
    if (error) {
      errors[field.name] = error;
      isValid = false;
    }
  });

  return { isValid, errors };
}

/**
 * UI: Display errors next to inputs
 */
function displayErrors(errors, formId) {
  const form = document.getElementById(formId);
  if (!form) return;

  // Clear existing errors
  clearFormErrors(formId);

  Object.entries(errors).forEach(([fieldName, message]) => {
    const input = form.querySelector(`[id="${fieldName}"], [name="${fieldName}"]`);
    if (input) {
      input.classList.add("input-error");
      
      const errorMsg = document.createElement("span");
      errorMsg.className = "field-error-msg";
      errorMsg.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${message}`;
      
      // Handle different input wrappers
      const wrapper = input.closest(".input-wrapper") || input.parentElement;
      wrapper.appendChild(errorMsg);
      
      // Add animation class
      setTimeout(() => errorMsg.classList.add("show"), 10);
    }
  });
}

/**
 * UI: Clear all error states from a form
 */
function clearFormErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
  form.querySelectorAll(".field-error-msg").forEach(el => el.remove());
}

// Add CSS styles for errors dynamically if not present
if (!document.getElementById("validation-styles")) {
  const style = document.createElement("style");
  style.id = "validation-styles";
  style.innerHTML = `
    .input-error { border-color: var(--danger) !important; background-color: #fff5f5 !important; }
    .field-error-msg { 
      color: var(--danger); 
      font-size: 0.75rem; 
      font-weight: 600; 
      margin-top: 5px; 
      display: flex; 
      align-items: center; 
      gap: 5px; 
      opacity: 0; 
      transform: translateY(-5px);
      transition: all 0.2s ease;
    }
    .field-error-msg.show { opacity: 1; transform: translateY(0); }
    .dark-mode .input-error { background-color: rgba(239, 68, 68, 0.1) !important; }
  `;
  document.head.appendChild(style);
}
