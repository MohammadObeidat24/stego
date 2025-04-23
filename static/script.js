document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    })

    // Timer toggle
    document.getElementById('enableTimer').addEventListener('change', function() {
        document.getElementById('timeFields').style.display = this.checked ? 'block' : 'none'
    })

    // Location toggle
    document.getElementById('enableLocation').addEventListener('change', function() {
        if (this.checked && !navigator.geolocation) {
            showAlert('error', 'Geolocation is not supported by your browser')
            this.checked = false
        }
    })

    // Dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle')
    darkModeToggle.addEventListener('change', function() {
        document.body.classList.toggle('dark-mode', this.checked)
        localStorage.setItem('darkMode', this.checked)
    })

    // Load dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        darkModeToggle.checked = true
        document.body.classList.add('dark-mode')
    }

    // Hide form submission
    document.getElementById('hideForm').addEventListener('submit', async function(e) {
        e.preventDefault()
        
        const resultDiv = document.getElementById('hideResult')
        resultDiv.innerHTML = loadingIndicator('Processing your image...')
        
        try {
            const formData = new FormData(this)
            
            // Get location if enabled
            if (document.getElementById('enableLocation').checked) {
                try {
                    const position = await getCurrentPosition()
                    formData.append('lat', position.coords.latitude)
                    formData.append('lng', position.coords.longitude)
                } catch (error) {
                    showAlert('error', `Location error: ${error.message}`, resultDiv)
                    return
                }
            }
            
            const response = await fetch('/api/hide', {
                method: 'POST',
                body: formData
            })

            if (response.ok) {
                const blob = await response.blob()
                const url = URL.createObjectURL(blob)
                
                resultDiv.innerHTML = `
                    <div class="alert alert-success">
                        <h5><i class="bi bi-check-circle"></i> Success!</h5>
                        <p>Your text has been securely hidden in the image.</p>
                        <div class="text-center my-3">
                            <img src="${url}" class="img-fluid rounded border" style="max-height: 200px;">
                        </div>
                        <div class="d-grid gap-2">
                            <a href="${url}" download="secure_image.png" class="btn btn-success">
                                <i class="bi bi-download"></i> Download Image
                            </a>
                        </div>
                        <div class="mt-3">
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle"></i> 
                                <strong>Important:</strong> Save this password securely as it's required to extract the text.
                            </div>
                        </div>
                    </div>
                `
            } else {
                const error = await response.json()
                showAlert('error', error.error || 'An unknown error occurred', resultDiv)
            }
        } catch (error) {
            showAlert('error', error.message || 'Network error occurred', resultDiv)
        }
    })

    // Extract form submission
    document.getElementById('extractForm').addEventListener('submit', async function(e) {
        e.preventDefault()
        
        const resultDiv = document.getElementById('extractResult')
        resultDiv.innerHTML = loadingIndicator('Extracting text from image...')
        
        try {
            const formData = new FormData(this)
            const imageFile = document.getElementById('hiddenImage').files[0]
            
            if (!imageFile) {
                showAlert('error', 'Please select an image file', resultDiv)
                return
            }
            
            // First check if location is needed
            const checkResponse = await fetch('/api/extract', {
                method: 'POST',
                body: formData
            })
            
            const checkResult = await checkResponse.json()
            
            if (checkResult.requiresLocation) {
                try {
                    const position = await getCurrentPosition()
                    formData.append('userLat', position.coords.latitude)
                    formData.append('userLng', position.coords.longitude)
                    
                    // Retry with location
                    const finalResponse = await fetch('/api/extract', {
                        method: 'POST',
                        body: formData
                    })
                    
                    const finalResult = await finalResponse.json()
                    displayResult(finalResult, resultDiv)
                } catch (error) {
                    showAlert('error', `Location error: ${error.message}`, resultDiv)
                }
            } else {
                displayResult(checkResult, resultDiv)
            }
        } catch (error) {
            showAlert('error', error.message || 'Network error occurred', resultDiv)
        }
    })

    // Input validation
    document.getElementById('imageInput').addEventListener('change', function() {
        validateFileSize(this, 8)
    })

    document.getElementById('hiddenImage').addEventListener('change', function() {
        validateFileSize(this, 8)
    })
})

// Helper functions
function loadingIndicator(message) {
    return `
        <div class="alert alert-info">
            <div class="d-flex align-items-center">
                <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                <span>${message}</span>
            </div>
        </div>
    `
}

function showAlert(type, message, element) {
    const icon = type === 'error' ? 'exclamation-triangle' : 'check-circle'
    element.innerHTML = `
        <div class="alert alert-${type}">
            <h5><i class="bi bi-${icon}"></i> ${type.charAt(0).toUpperCase() + type.slice(1)}</h5>
            <p>${message}</p>
        </div>
    `
}

function displayResult(result, element) {
    if (result.success) {
        const escapedText = escapeHtml(result.text)
        element.innerHTML = `
            <div class="alert alert-success">
                <h5><i class="bi bi-check-circle"></i> Extracted Text</h5>
                <div class="bg-white bg-dark-mode-dark p-3 rounded mt-2">
                    <pre class="mb-0">${escapedText}</pre>
                </div>
                <button class="btn btn-outline-primary mt-3" onclick="copyToClipboard('${escapeSingleQuotes(result.text)}')">
                    <i class="bi bi-clipboard"></i> Copy to Clipboard
                </button>
            </div>
        `
    } else {
        showAlert('error', result.error || 'Failed to extract text', element)
    }
}

function validateFileSize(input, maxSizeMB) {
    if (input.files[0] && input.files[0].size > maxSizeMB * 1024 * 1024) {
        showAlert('error', `Image size exceeds ${maxSizeMB}MB limit`, input.parentNode)
        input.value = ''
    }
}

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

function escapeSingleQuotes(text) {
    return text.replace(/'/g, "\\'")
}

function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'))
            return
        }
        
        navigator.geolocation.getCurrentPosition(
            position => resolve(position),
            error => {
                let message
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        message = 'Permission denied. Please enable location access.'
                        break
                    case error.POSITION_UNAVAILABLE:
                        message = 'Location information unavailable.'
                        break
                    case error.TIMEOUT:
                        message = 'Location request timed out.'
                        break
                    default:
                        message = 'Unknown error getting location.'
                }
                reject(new Error(message))
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    })
}

// Global function for copy button
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        const alert = document.createElement('div')
        alert.className = 'alert alert-info position-fixed top-0 end-0 m-3'
        alert.innerHTML = '<i class="bi bi-check-circle"></i> Copied to clipboard!'
        document.body.appendChild(alert)
        setTimeout(() => alert.remove(), 2000)
    })
}
