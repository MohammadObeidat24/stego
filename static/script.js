document.addEventListener('DOMContentLoaded', function() {

    const intro = document.getElementById('introScreen');
    if (intro) {
        const logo = document.createElement('img');
        logo.src = "/static/secure-text-hider-logo.png";
        logo.alt = "Secure Text Hider Logo";
        logo.id = "splashLogo";
        logo.className = "img-fluid";
        logo.style.maxWidth = "720px";
        logo.style.display = "block";
        logo.style.margin = "0 auto";
        
        intro.appendChild(logo);
        setTimeout(() => {
            logo.classList.add("splash-animate");

            setTimeout(() => {
                intro.style.opacity = '0';

                setTimeout(() => {
                    intro.remove();
                }, 3000);
            }, 3000);
        }, 3000);
    }

    

    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    tooltipTriggerList.map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))


    document.getElementById('enableTimer').addEventListener('change', function() {
        document.getElementById('timeFields').style.display = this.checked ? 'block' : 'none'
    })


    document.getElementById('enableLocation').addEventListener('change', function() {
        if (this.checked && !navigator.geolocation) {
            alert('Geolocation is not supported by your browser')
            this.checked = false
        }
    })


    const darkModeToggle = document.getElementById('darkModeToggle')
    darkModeToggle.addEventListener('change', function() {
        document.body.classList.toggle('dark-mode', this.checked)
        localStorage.setItem('darkMode', this.checked)
    })

  
    if (localStorage.getItem('darkMode') === 'true') {
        darkModeToggle.checked = true
        document.body.classList.add('dark-mode')
    }


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

        if (document.getElementById('enableLocation').checked) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000
                    })
                })
                formData.append('lat', position.coords.latitude)
                formData.append('lng', position.coords.longitude)
            } catch (error) {
                document.getElementById('hideResult').innerHTML = `
                <div class="alert alert-danger">
                    <h5><i class="bi bi-exclamation-triangle"></i> ${errorMessage}</h5>
                    <button class="btn btn-primary w-100 mt-2" onclick="this.closest('form').requestSubmit()">
                        <i class="bi bi-arrow-clockwise"></i> Try Again
                    </button>
                </div>
                `
                return
            }
        }

        const resultDiv = document.getElementById('hideResult')
        resultDiv.innerHTML = `
            <div class="alert alert-info">
                <div class="spinner-border spinner-border-sm me-2"></div>
                Processing your image...
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
                        <img src="${url}" class="img-fluid my-2" style="max-height:200px">
                        <a href="${url}" download="secure_image.png" class="btn btn-success w-100">
                            <i class="bi bi-download"></i> Download Secure Image
                        </a>
                    </div>
                `
            } else {
                const error = await response.json()
                throw new Error(error.error || 'Failed to hide text in image')
            }
        } catch (error) {
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <h5><i class="bi bi-exclamation-triangle"></i> Error</h5>
                    <p>${error.message}</p>
                    <button class="btn btn-sm btn-outline-primary mt-2" onclick="this.closest('form').requestSubmit()">
                        <i class="bi bi-arrow-clockwise"></i> Try Again
                    </button>
                </div>
            `
            console.error('Hiding error:', error)
        }
    })


    document.getElementById('extractForm').addEventListener('submit', async function(e) {
        e.preventDefault()
        console.log('Starting extraction process...')
        
        const resultDiv = document.getElementById('extractResult')
        resultDiv.innerHTML = `
            <div class="alert alert-info">
                <div class="spinner-border spinner-border-sm me-2"></div>
                Preparing extraction...
            </div>
        `

        try {
            const imageFile = document.getElementById('hiddenImage').files[0]
            const password = document.getElementById('decryptPassword').value
            
            if (!imageFile) throw new Error('Please select an image file')
            if (!password) throw new Error('Please enter the password')


            const formData = new FormData()
            formData.append('image', imageFile)
            formData.append('password', password)
            console.log('FormData prepared with image size:', imageFile.size)


            let position;
            try {
                position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 5000
                    })
                })
                formData.append('current_lat', position.coords.latitude)
                formData.append('current_lng', position.coords.longitude)
                console.log('Location added:', position.coords)
            } catch (geoError) {
                console.log('Proceeding without location:', geoError.message)
            }


            resultDiv.innerHTML = `
                <div class="alert alert-info">
                    <div class="spinner-border spinner-border-sm me-2"></div>
                    Extracting text from image...
                </div>
            `


            const controller = new AbortController()
            const timeoutId = setTimeout(() => {
                if (!controller.signal.aborted) {
                    controller.abort()
                    console.log('Request timed out after 15s')
                }
            }, 15000)

            const response = await fetch('/api/extract', {
                method: 'POST',
                body: formData,
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId))

            console.log('Server response received')

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Server error' }))
                throw new Error(error.error || `Server returned ${response.status}`)
            }

            const result = await response.json()
            console.log('Extraction result:', result)


            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <h5><i class="bi bi-check-circle"></i> Extraction Successful!</h5>
                    <div class="bg-light p-3 mb-2 rounded">
                        <pre style="white-space: pre-wrap;">${result.text}</pre>
                    </div>
                    <button class="btn btn-outline-primary w-100 mt-2" onclick="navigator.clipboard.writeText('${result.text.replace(/'/g, "\\'")}')">
                        <i class="bi bi-clipboard"></i> Copy Text
                    </button>
                </div>
            `

        } catch (error) {
            console.error('Extraction failed:', error)
            let errorMessage = error.message
            
            if (error.name === 'AbortError') {
                errorMessage = 'Request timed out (15s) - Try with a smaller image'
            } else if (error.message.includes('password')) {
                errorMessage = 'Incorrect password'
            } else if (error.message.includes('No hidden data')) {
                errorMessage = 'No hidden text found in this image'
            }

            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <h5><i class="bi bi-exclamation-triangle"></i> ${errorMessage}</h5>
                    <button class="btn btn-primary w-100 mt-2" onclick="this.closest('form').requestSubmit()">
                        <i class="bi bi-arrow-clockwise"></i> Try Again
                    </button>
                </div>
            `
        }
    })


    document.getElementById('imageInput').addEventListener('change', function() {
        if (this.files[0]?.size > 8 * 1024 * 1024) {
            alert('Maximum file size is 8MB. Please choose a smaller image.')
            this.value = ''
        }
    })

    document.getElementById('hiddenImage').addEventListener('change', function() {
        if (this.files[0]?.size > 8 * 1024 * 1024) {
            alert('Maximum file size is 8MB. Please choose a smaller image.')
            this.value = ''
        }
    })
})
