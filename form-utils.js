export function getFormData(formElement) {
    const formData = new FormData(formElement);
    const data = {};
    for (const [key, value] of formData.entries()) {
        // Attempt to convert numeric fields. Note: We rely on form validation/input types for clean data.
        if (formElement.querySelector(`[name="${key}"]`)?.type === 'number' || key.includes('Amount') || key.includes('iva') || key.includes('total')) {
            data[key] = parseFloat(value) || 0;
        } else {
            data[key] = value.trim();
        }
    }
    return data;
}

export function formatCurrency(amount, includeSymbol = true) {
    if (typeof amount !== 'number') amount = 0;

    if (!includeSymbol) {
        // Return plain number string with 2 decimal places
        return amount.toFixed(2);
    }
    
    // Format as USD (standard currency in El Salvador)
    return new Intl.NumberFormat('es-SV', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}