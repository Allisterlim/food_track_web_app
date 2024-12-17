function logAuthDetails(message, data) {
    console.log('%c[Auth Debug] ' + message, 'background: #f0f0f0; color: #333; padding: 2px 5px;', data);
}

const CLIENT_CONFIG = {
    "client_id": "986319166215-mtmm4gfqvcpm2vo9tee2nnp1t0o8vgg3.apps.googleusercontent.com",
    "project_id": "food-container-439701",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "javascript_origins": [
        "http://localhost:8080",
        "https://food-track-web-app-986319166215.australia-southeast2.run.app"
    ],
    "authorized_domains": [
        "localhost",
        "food-track-web-app-986319166215.australia-southeast2.run.app"
    ]
};

// Log initial configuration
logAuthDetails('OAuth Configuration:', {
    client_id: CLIENT_CONFIG.client_id,
    current_url: window.location.href,
    hostname: window.location.hostname,
    allowed_origins: CLIENT_CONFIG.javascript_origins,
    project_id: CLIENT_CONFIG.project_id
});

const FOLDER_ID = '1cnK5Le4U1vUtG_PiGrqU-wxEQKL2Zjfb';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const BATCH_SIZE = 10;

let tokenClient;
let gapiInited = false;
let gisInited = false;
let currentlyLoading = false;
let allFiles = [];
let processedFiles = new Set();

function gapiLoaded() {
    logAuthDetails('GAPI loading started');
    gapi.load('client', {
        callback: initializeGapiClient,
        onerror: (error) => logAuthDetails('GAPI load error:', error)
    });
}

async function initializeGapiClient() {
    logAuthDetails('Initializing GAPI client...');
    try {
        const initConfig = {
            clientId: CLIENT_CONFIG.client_id,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        };
        logAuthDetails('GAPI init config:', initConfig);

        await gapi.client.init(initConfig);

        logAuthDetails('GAPI client initialized successfully', {
            hasToken: !!gapi.client.getToken(),
            apiKey: !!gapi.client.apiKey,
            clientId: !!gapi.client.clientId
        });

        gapiInited = true;
        maybeEnableButtons();
    } catch (error) {
        logAuthDetails('GAPI initialization error:', {
            message: error.message,
            stack: error.stack,
            details: error.details || 'No additional details'
        });
    }
}

function gisLoaded() {
    logAuthDetails('GIS loading started...');
    const tokenConfig = {
        client_id: CLIENT_CONFIG.client_id,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.error !== undefined) {
                console.error('Authorization error:', resp);
                return;
            }
            // Handle successful authorization
        }
    };

    try {
        tokenClient = google.accounts.oauth2.initTokenClient(tokenConfig);
        logAuthDetails('Token client initialized:', {
            hasTokenClient: !!tokenClient,
            scope: SCOPES
        });
        gisInited = true;
        maybeEnableButtons();
    } catch (error) {
        logAuthDetails('Token client initialization error:', error);
    }
}

function maybeEnableButtons() {
    logAuthDetails('Checking button state - GAPI:', gapiInited, 'GIS:', gisInited);
    if (gapiInited && gisInited) {
        document.getElementById('authorize-button').style.display = 'block';
        logAuthDetails('Authorization button enabled');
    }
}

async function listFiles() {
    logAuthDetails('Starting listFiles...');
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '<div id="loading" class="loading">Loading fresh images...</div>';

    try {
        logAuthDetails('Fetching files from Drive...');
        const response = await gapi.client.drive.files.list({
            q: `'${FOLDER_ID}' in parents and (mimeType contains 'image/' or mimeType contains 'application/json') and trashed = false`,
            fields: 'files(id, name, modifiedTime, mimeType)',
            pageSize: 1000,
            orderBy: 'modifiedTime desc',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        allFiles = response.result.files;
        logAuthDetails(`Found files:`, {
            totalFiles: allFiles.length,
            imageFiles: allFiles.filter(f => f.mimeType.includes('image/')).length,
            jsonFiles: allFiles.filter(f => f.mimeType.includes('json')).length
        });

        processedFiles.clear();
        currentlyLoading = false;
        gallery.innerHTML = '';

        await processNextBatch();

        updateImageCount(allFiles.filter(f => f.mimeType.includes('image/')).length);
        document.getElementById('refresh-button').style.display = 'block';

    } catch (err) {
        logAuthDetails('Error in listFiles:', {
            error: err.message,
            stack: err.stack,
            details: err.details || 'No additional details'
        });
        gallery.innerHTML = '<div class="error">Error loading images. Please try refreshing.</div>';
    }
}

function handleAuthClick() {
    logAuthDetails('Auth click handler started');

    tokenClient.callback = async (resp) => {
        logAuthDetails('Token client callback received response:', {
            hasError: !!resp.error,
            errorDetails: resp.error,
            hasAccessToken: !!resp.access_token,
            expiresIn: resp.expires_in
        });

        if (resp.error !== undefined) {
            logAuthDetails('Token client error:', {
                error: resp.error,
                errorSubtype: resp.error_subtype,
                errorURI: resp.error_uri,
                errorDescription: resp.error_description
            });
            throw resp;
        }

        const token = gapi.client.getToken();
        logAuthDetails('Current token state:', {
            hasToken: !!token,
            tokenDetails: token ? {
                expiresIn: token.expires_in,
                scope: token.scope,
                tokenType: token.token_type
            } : null
        });

        document.getElementById('authorize-button').style.display = 'none';
        await listFiles();
    };

    if (gapi.client.getToken() === null) {
        logAuthDetails('Requesting access token with consent');
        try {
            tokenClient.requestAccessToken({prompt: 'consent'});
        } catch (error) {
            logAuthDetails('Error requesting access token:', error);
        }
    } else {
        logAuthDetails('Requesting access token without consent');
        try {
            tokenClient.requestAccessToken({prompt: ''});
        } catch (error) {
            logAuthDetails('Error requesting access token:', error);
        }
    }
}

function displayDateSection(date, items) {
    logAuthDetails(`Displaying date section for: ${date}`, {
        itemCount: items.length
    });

    const gallery = document.getElementById('gallery');

    const existingButton = document.getElementById('load-more-button');
    if (existingButton) {
        existingButton.remove();
    }

    const existingSection = Array.from(gallery.children).find(
        child => child.querySelector('.date-text')?.textContent === date
    );

    let dateSection;
    let dateContainer;

    if (existingSection) {
        dateSection = existingSection;
        dateContainer = existingSection.querySelector('.date-container');
        if (!dateContainer) {
            dateContainer = document.createElement('div');
            dateContainer.className = 'date-container';
            dateSection.appendChild(dateContainer);
        }
    } else {
        dateSection = document.createElement('div');
        dateSection.className = 'date-section';

        let totalCalories = 0;
        let validCalorieCount = 0;

        items.forEach(({ data }) => {
            if (data.nutritional_info && data.nutritional_info["calories (kcal)"]) {
                const calories = parseFloat(data.nutritional_info["calories (kcal)"]);
                if (!isNaN(calories)) {
                    totalCalories += calories;
                    validCalorieCount++;
                }
            }
        });

        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.innerHTML = `
            <div class="date-header-content">
                <div class="date-text">${date}</div>
                <div class="calorie-total">Total Calories: ${Math.round(totalCalories)} kcal (${validCalorieCount} items)</div>
            </div>
        `;
        dateSection.appendChild(dateHeader);

        dateContainer = document.createElement('div');
        dateContainer.className = 'date-container';
        dateSection.appendChild(dateContainer);

        const allSections = Array.from(gallery.children);
        const insertIndex = allSections.findIndex(section => {
            const sectionDate = section.querySelector('.date-text')?.textContent;
            return sectionDate && new Date(sectionDate) < new Date(date);
        });

        if (insertIndex === -1) {
            gallery.appendChild(dateSection);
        } else {
            gallery.insertBefore(dateSection, allSections[insertIndex]);
        }
    }

    items.forEach(({ file, data }) => {
        const containerDiv = document.createElement('div');
        containerDiv.className = 'gallery-item';

        const img = document.createElement('img');
        const timestamp = new Date().getTime();
        img.src = `https://drive.google.com/thumbnail?id=${file.id}&sz=w1000&t=${timestamp}`;
        img.alt = file.name;
        img.loading = 'lazy';
        img.onerror = function() {
            const newTimestamp = new Date().getTime();
            this.src = `https://drive.google.com/uc?export=view&id=${file.id}&t=${newTimestamp}`;
        };
        containerDiv.appendChild(img);

        const dataDiv = document.createElement('div');
        dataDiv.className = 'metadata';

        let content = `<div>Time: ${new Date(data.timestamp).toLocaleString()}</div>`;

        if (data.nutritional_info) {
            const nutInfo = data.nutritional_info;
            content += `
                <div style="margin: 8px 0; padding: 8px; background-color: #f8f9fa; border-radius: 4px;">
                    <div>Total Weight: ${nutInfo.total_weight_grams || data.weight_grams}g</div>
                    <div>Food Weight: ${nutInfo.food_weight_grams || data.weight_grams}g</div>
                </div>
                <div class="food-name">${nutInfo.food_identified_short}</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
                    <div>Calories: ${nutInfo["calories (kcal)"]} kcal</div>
                    <div>Carbs: ${nutInfo["carbohydrates (g)"]}g</div>
                    <div>Protein: ${nutInfo["protein (g)"]}g</div>
                    <div>Fat: ${nutInfo["fat (g)"]}g</div>
                </div>
            `;
        } else {
            content += `<div>Weight: ${data.weight_grams}g</div>`;
        }

        dataDiv.innerHTML = content;
        containerDiv.appendChild(dataDiv);
        dateContainer.appendChild(containerDiv);
    });

    updateLoadMoreButton();
}

async function processNextBatch() {
    logAuthDetails('Starting processNextBatch');
    if (currentlyLoading) {
        logAuthDetails('Already loading a batch, skipping...');
        return;
    }

    currentlyLoading = true;
    const loadMoreButton = document.getElementById('load-more-button');
    if (loadMoreButton) {
        loadMoreButton.disabled = true;
        loadMoreButton.innerHTML = 'Loading...';
    }

    try {
        const imageFiles = allFiles.filter(file => 
            file.mimeType.includes('image/') && 
            !processedFiles.has(file.name)
        );

        if (imageFiles.length === 0) {
            logAuthDetails('No more images to process');
            currentlyLoading = false;
            updateLoadMoreButton();
            return;
        }

        const batchFiles = imageFiles.slice(0, BATCH_SIZE);
        const filesByDate = {};

        for (const file of batchFiles) {
            try {
                const data = await getAnalysisForImage(allFiles, file.name);
                if (data && data.timestamp) {
                    const date = new Date(data.timestamp).toLocaleDateString();
                    if (!filesByDate[date]) {
                        filesByDate[date] = [];
                    }
                    filesByDate[date].push({ file, data });
                    processedFiles.add(file.name);
                }
            } catch (error) {
                logAuthDetails(`Error processing file ${file.name}:`, {
                    error: error.message,
                    stack: error.stack
                });
            }
        }

        for (const date in filesByDate) {
            await displayDateSection(date, filesByDate[date]);
        }

    } catch (error) {
        logAuthDetails('Error in processNextBatch:', {
            error: error.message,
            stack: error.stack
        });
        const gallery = document.getElementById('gallery');
        gallery.innerHTML += '<div class="error">Error loading images. Please try refreshing.</div>';
    } finally {
        currentlyLoading = false;
        updateLoadMoreButton();
    }
}

async function getAnalysisForImage(files, imageName) {
    logAuthDetails(`Getting analysis for image: ${imageName}`);
    const timestamp = imageName.split('optimized_food_container_')[1]?.split('.')[0];
    if (!timestamp) {
        logAuthDetails('No timestamp found in filename');
        return null;
    }

    const analysisFileName = `analysis_${timestamp}.json`;
    const metadataFileName = `metadata_${timestamp}.json`;

    const analysisFile = files.find(f => f.name === analysisFileName);
    const metadataFile = files.find(f => f.name === metadataFileName);

    logAuthDetails('Files found:', {
        analysisFile: !!analysisFile,
        metadataFile: !!metadataFile
    });

    let data = null;

    try {
        if (analysisFile) {
            logAuthDetails('Fetching analysis file...');
            const response = await gapi.client.drive.files.get({
                fileId: analysisFile.id,
                alt: 'media'
            });
            data = response.result;
        } else if (metadataFile) {
            logAuthDetails('Fetching metadata file...');
            const response = await gapi.client.drive.files.get({
                fileId: metadataFile.id,
                alt: 'media'
            });
            data = response.result;
        }
        logAuthDetails('Data retrieved successfully');
        return data;
    } catch (error) {
        logAuthDetails('Error fetching analysis:', {
            error: error.message,
            stack: error.stack
        });
        return null;
    }
}

function updateLoadMoreButton() {
    logAuthDetails('Updating load more button');
    const existingButton = document.getElementById('load-more-button');
    if (existingButton) {
        existingButton.remove();
    }

    const remainingImages = allFiles.filter(file => 
        file.mimeType.includes('image/') && 
        !processedFiles.has(file.name)
    ).length;

    logAuthDetails(`Remaining images: ${remainingImages}`);

    if (remainingImages > 0) {
        const loadMoreButton = document.createElement('button');
        loadMoreButton.id = 'load-more-button';
        loadMoreButton.className = 'load-more-button';
        loadMoreButton.innerHTML = `Load More (${remainingImages} items remaining)`;
        loadMoreButton.disabled = currentlyLoading;

        const newLoadMoreButton = loadMoreButton.cloneNode(true);

        newLoadMoreButton.addEventListener('click', () => {
            logAuthDetails('Load more button clicked');
            processNextBatch();
        });

        document.getElementById('gallery').appendChild(newLoadMoreButton);
    }
}

function updateImageCount(count) {
    logAuthDetails(`Updating image count: ${count}`);
    document.getElementById('imageCount').textContent = 
        `Displaying ${count} image${count !== 1 ? 's' : ''}`;
}

function handleRefreshClick() {
    logAuthDetails('Refresh clicked');
    const loadMoreButton = document.getElementById('load-more-button');
    if (loadMoreButton) {
        loadMoreButton.remove();
    }

    allFiles = [];
    processedFiles.clear();
    currentlyLoading = false;
    if ('caches' in window) {
        caches.keys().then(cacheNames => {
            cacheNames.forEach(cacheName => {
                caches.delete(cacheName);
                logAuthDetails(`Deleted cache: ${cacheName}`);
            });
        });
    }

    logAuthDetails('Starting refresh...');
    listFiles();
}

// Add periodic token state check
function checkTokenState() {
    const token = gapi.client.getToken();
    logAuthDetails('Current token state:', {
        hasToken: !!token,
        tokenDetails: token ? {
            expiresIn: token.expires_in,
            scope: token.scope,
            tokenType: token.token_type
        } : null
    });
}

setInterval(checkTokenState, 30000); // Check token state every 30 seconds

document.getElementById('authorize-button').addEventListener('click', handleAuthClick);
document.getElementById('refresh-button').addEventListener('click', handleRefreshClick);

// Refresh every 5 minutes
logAuthDetails('Setting up auto-refresh interval');