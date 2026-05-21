// ===== CLIENT-SIDE VALIDATION & UTILITIES =====

const validators = {
  studentId: (id) => /^[A-Za-z0-9\-]{1,20}$/.test(id),
  name: (name) => /^[A-Za-z\s]{2,100}$/.test(name) && name.trim().length >= 2,
  email: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  phone: (phone) => /^[\d+\-\(\)\s]{7,20}$/.test(phone),
  amount: (amount) => Number(amount) > 0 && Number(amount) < 10000000,
  marks: (marks) => Number(marks) >= 0 && Number(marks) <= 100,
  isEmpty: (value) => !value || String(value).trim() === ""
};

const errorMessages = {
  studentId: "Student ID: Alphanumeric only, 1-20 characters",
  name: "Name: Letters and spaces only, 2-100 characters",
  email: "Email: Valid email format required",
  phone: "Phone: Valid phone number required",
  amount: "Amount: Must be between 1 and 9,999,999",
  marks: "Marks: Must be between 0 and 100",
  required: "This field is required"
};

function validateForm(data, fields) {
  const errors = {};

  fields.forEach(field => {
    const value = data[field.name];

    if (field.required && validators.isEmpty(value)) {
      errors[field.name] = errorMessages.required;
      return;
    }

    if (!field.required && validators.isEmpty(value)) {
      return;
    }

    if (field.type && validators[field.type]) {
      if (!validators[field.type](value)) {
        errors[field.name] = errorMessages[field.type] || `Invalid ${field.name}`;
      }
    }
  });

  return errors;
}

function displayErrors(errors, formId) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.querySelectorAll(".field-error").forEach(el => el.remove());

  Object.entries(errors).forEach(([field, message]) => {
    const input = form.querySelector(`[name="${field}"]`);
    if (input) {
      const errorEl = document.createElement("div");
      errorEl.className = "field-error";
      errorEl.textContent = message;
      input.after(errorEl);
      input.classList.add("error");
    }
  });
}

function clearFormErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll(".field-error").forEach(el => el.remove());
  form.querySelectorAll(".error").forEach(el => el.classList.remove("error"));
}
