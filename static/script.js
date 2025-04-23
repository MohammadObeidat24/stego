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
            alert('Geolocation is not supported by your browser')
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
        
        const formData = new FormData()
        formData.append('image', document.getElementById('imageInput').files[0])
        formData.append('text', document.getElementById('secretText').value)
        formData.append('password', document.getElementById('encryptPassword').value)
        formData.append('enableTimer', document.getElementById('enableTimer').checked)
        formData.append('minutes', document.getElementById('minutes').value)
        formData.append('hours', document.getElementById('hours').value)
        formData.append('days', document.getElementById('days').value)
        formData.append('enableLocation', document.getElementById('enableLocation').checked)

        // Get location if enabled
        if (document.getElementById('enableLocation').checked) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject)
                })
                formData.append('lat', position.coords.latitude)
                formData.append('lng', position.coords.longitude)
            } catch (error) {
                alert('Error getting location: ' + error.message)
                return
            }
        }

        const resultDiv = document.getElementById('hideResult')
        resultDiv.innerHTML = `
            <div class="alert alert-info">
                <div class="d-flex align-items-center">
                    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                    <span>Processing your image...</span>
                </div>
            </div>
        `

        try {
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
                                <i class="bi bi-exclamation-triangle"></i> <strong>Important:</strong> Save this password securely as it's required to extract the text later.
                            </div>
                        </div>
                    </div>
                `
            } else {
                const error = await response.json()
                resultDiv.innerHTML = `
                    <div class="alert alert-danger">
                        <h5><i class="bi bi-exclamation-triangle"></i> Error</h5>
                        <p>${error.error || 'An unknown error occurred'}</p>
                    </div>
                `
            }
        } catch (error) {
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <h5><i class="bi bi-exclamation-triangle"></i> Network Error</h5>
                    <p>${error.message}</p>
                </div>
            `
        }
    })

    // Extract form submission
    document.getElementById('extractForm').addEventListener('submit', async function(e) {
        e.preventDefault()
        
        const formData = new FormData()
        formData.append('image', document.getElementById('hiddenImage').files[0])
        formData.append('password', document.getElementById('decryptPassword').value)

        const resultDiv = document.getElementById('extractResult')
        resultDiv.innerHTML = `
            <div class="alert alert-info">
                <div class="d-flex align-items-center">
                    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                    <span>Extracting text from image...</span>
                </div>
            </div>
        `

        try {
            // First request to check if location is required
            const checkResponse = await fetch('/api/extract', {
                method: 'POST',
                body: formData
            })
            
            const checkResult = await checkResponse.json()
            
            if (checkResult.requiresLocation) {
                // Get user's current location
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject)
                })
                
                formData.append('userLat', position.coords.latitude)
                formData.append('userLng', position.coords.longitude)
                
                // Second request with location data
                const finalResponse = await fetch('/api/extract', {
                    method: 'POST',
                    body: formData
                })
                
                const finalResult = await finalResponse.json()
                displayResult(finalResult, resultDiv)
            } else {
                displayResult(checkResult, resultDiv)
            }
        } catch (error) {
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <h5><i class="bi bi-exclamation-triangle"></i> Error</h5>
                    <p>${error.message || 'Failed to extract text'}</p>
                </div>
            `
        }
    })

    function displayResult(result, element) {
        if (result.success) {
            element.innerHTML = `
                <div class="alert alert-success">
                    <h5><i class="bi bi-check-circle"></i> Extracted Text</h5>
                    <div class="bg-white bg-dark-mode-dark p-3 rounded mt-2">
                        <pre class="mb-0">${result.text}</pre>
                    </div>
                    <button class="btn btn-outline-primary mt-3" onclick="navigator.clipboard.writeText('${result.text.replace(/'/g, "\\'")}')">
                        <i class="bi bi-clipboard"></i> Copy to Clipboard
                    </button>
                </div>
            `
        } else {
            element.innerHTML = `
                <div class="alert alert-danger">
                    <h5><i class="bi bi-exclamation-triangle"></i> Error</h5>
                    <p>${result.error || 'Failed to extract text'}</p>
                </div>
            `
        }
    }

    // Input validation
    document.getElementById('imageInput').addEventListener('change', function() {
        if (this.files[0] && this.files[0].size > 8 * 1024 * 1024) {
            alert('Image size exceeds 8MB limit')
            this.value = ''
        }
    })

    document.getElementById('hiddenImage').addEventListener('change', function() {
        if (this.files[0] && this.files[0].size > 8 * 1024 * 1024) {
            alert('Image size exceeds 8MB limit')
            this.value = ''
        }
    })
})
