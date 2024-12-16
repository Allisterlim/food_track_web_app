const CLIENT_CONFIG = {
    "client_id": "986319166215-mtmm4gfqvcpm2vo9tee2nnp1t0o8vgg3.apps.googleusercontent.com",
    "project_id": "food-container-439701",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "javascript_origins": [
        "http://localhost:8080",
        "https://food-track-web-app-986319166215.australia-southeast2.run.app"
    ]
};


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
    console.log('GAPI loading started...');
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    console.log('Initializing GAPI client...');
    try {
        await gapi.client.init({
            clientId: CLIENT_CONFIG.client_id,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
        gapiInited = true;
        console.log('GAPI client initialized successfully');
        maybeEnableButtons();
    } catch (error) {
        console.error('Error initializing GAPI client:', error);
    }
}

function gisLoaded() {
    console.log('GIS loading started...');
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_CONFIG.client_id,
        scope: SCOPES,
        callback: '',
        redirect_uri: CLIENT_CONFIG.redirect_uri
    });
    gisInited = true;
    console.log('GIS loaded successfully');
    maybeEnableButtons();
}

function maybeEnableButtons() {
    console.log('Checking button state - GAPI:', gapiInited, 'GIS:', gisInited);
    if (gapiInited && gisInited) {
        document.getElementById('authorize-button').style.display = 'block';
        console.log('Authorization button enabled');
    }
}

async function listFiles() {
    console.log('Starting listFiles...');
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '<div id="loading" class="loading">Loading fresh images...</div>';

    try {
        console.log('Fetching files from Drive...');
        const response = await gapi.client.drive.files.list({
            q: `'${FOLDER_ID}' in parents and (mimeType contains 'image/' or mimeType contains 'application/json') and trashed = false`,
            fields: 'files(id, name, modifiedTime, mimeType)',
            pageSize: 1000,
            orderBy: 'modifiedTime desc',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        allFiles = response.result.files;
        console.log(`Found ${allFiles.length} total files`);
        console.log('Image files:', allFiles.filter(f => f.mimeType.includes('image/')).length);
        console.log('JSON files:', allFiles.filter(f => f.mimeType.includes('json')).length);

        processedFiles.clear();
        currentlyLoading = false;
        gallery.innerHTML = '';

        await processNextBatch();
        
        updateImageCount(allFiles.filter(f => f.mimeType.includes('image/')).length);
        document.getElementById('refresh-button').style.display = 'block';

    } catch (err) {
        console.error('Error in listFiles:', err);
        gallery.innerHTML = '<div class="error">Error loading images. Please try refreshing.</div>';
    }
}


function displayDateSection(date, items) {
    console.log(`Displaying date section for: ${date}`);
    const gallery = document.getElementById('gallery');
    
    // Remove load more button if it exists
    const existingButton = document.getElementById('load-more-button');
    if (existingButton) {
        console.log('Removing existing load more button');
        existingButton.remove();
    }

    // First try to find existing section for this date
    const existingSection = Array.from(gallery.children).find(
        child => child.querySelector('.date-text')?.textContent === date
    );

    // Initialize dateSection and dateContainer
    let dateSection;
    let dateContainer;

    if (existingSection) {
        console.log('Found existing section for date:', date);
        dateSection = existingSection;
        dateContainer = existingSection.querySelector('.date-container');
        if (!dateContainer) {
            console.log('Creating new date container in existing section');
            dateContainer = document.jjElement('div');
            dateContainer.className = 'date-container';
            dateSection.appendChild(dateContainer);
        }
    } else {
        console.log('Creating new section for date:', date);
        // Create new date section
        dateSection = document.createElement('div');
        dateSection.className = 'date-section';
        
        // Calculate calories
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
        
        // Create header
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.innerHTML = `
            <div class="date-header-content">
                <div class="date-text">${date}</div>
                <div class="calorie-total">Total Calories: ${Math.round(totalCalories)} kcal (${validCalorieCount} items)</div>
            </div>
        `;
        dateSection.appendChild(dateHeader);
        
        // Create container for items
        dateContainer = document.createElement('div');
        dateContainer.className = 'date-container';
        dateSection.appendChild(dateContainer);
        
        // Insert in chronological order
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

    console.log(`Adding ${items.length} items to container`);
    
    items.forEach(({ file, data }, index) => {
        console.log(`Processing item ${index + 1}/${items.length}`);
        const containerDiv = document.createElement('div');
        containerDiv.className = 'gallery-item';
        
        // Create image element
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

    // Re-add the load more button at the end
    updateLoadMoreButton();
}

// Update error handling in processNextBatch
async function processNextBatch() {
    console.log('Starting processNextBatch...');
    if (currentlyLoading) {
        console.log('Already loading a batch, skipping...');
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
            console.log('No more images to process');
            currentlyLoading = false;
            updateLoadMoreButton();
            return;
        }

        const batchFiles = imageFiles.slice(0, BATCH_SIZE);
        const filesByDate = {};
        
        for (const file of batchFiles) {
            try {
                console.log(`Processing file: ${file.name}`);
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
                console.error(`Error processing file ${file.name}:`, error);
            }
        }

        for (const date in filesByDate) {
            try {
                await displayDateSection(date, filesByDate[date]);
            } catch (error) {
                console.error(`Error displaying section for date ${date}:`, error);
            }
        }

    } catch (error) {
        console.error('Error in processNextBatch:', error);
        const gallery = document.getElementById('gallery');
        gallery.innerHTML += '<div class="error">Error loading images. Please try refreshing.</div>';
    } finally {
        console.log('Batch processing completed');
        currentlyLoading = false;
        updateLoadMoreButton();
    }
}

async function getAnalysisForImage(files, imageName) {
    console.log(`Getting analysis for image: ${imageName}`);
    const timestamp = imageName.split('optimized_food_container_')[1]?.split('.')[0];
    if (!timestamp) {
        console.log('No timestamp found in filename');
        return null;
    }

    const analysisFileName = `analysis_${timestamp}.json`;
    const metadataFileName = `metadata_${timestamp}.json`;
    
    const analysisFile = files.find(f => f.name === analysisFileName);
    const metadataFile = files.find(f => f.name === metadataFileName);
    
    console.log('Analysis file found:', !!analysisFile);
    console.log('Metadata file found:', !!metadataFile);

    let data = null;
    
    try {
        if (analysisFile) {
            console.log('Fetching analysis file...');
            const response = await gapi.client.drive.files.get({
                fileId: analysisFile.id,
                alt: 'media'
            });
            data = response.result;
        } else if (metadataFile) {
            console.log('Fetching metadata file...');
            const response = await gapi.client.drive.files.get({
                fileId: metadataFile.id,
                alt: 'media'
            });
            data = response.result;
        }
        console.log('Data retrieved successfully');
        return data;
    } catch (error) {
        console.error('Error fetching analysis:', error);
        return null;
    }
}




// Update the Load More button functionality
function updateLoadMoreButton() {
    console.log('Updating load more button');
    const existingButton = document.getElementById('load-more-button');
    if (existingButton) {
        console.log('Removing existing button');
        existingButton.remove();
    }

    const remainingImages = allFiles.filter(file => 
        file.mimeType.includes('image/') && 
        !processedFiles.has(file.name)
    ).length;
    
    console.log(`Remaining images: ${remainingImages}`);
    
    if (remainingImages > 0) {
        const loadMoreButton = document.createElement('button');
        loadMoreButton.id = 'load-more-button';
        loadMoreButton.className = 'load-more-button';
        loadMoreButton.innerHTML = `Load More (${remainingImages} items remaining)`;
        loadMoreButton.disabled = currentlyLoading;
        
        // Remove any existing click handlers
        const newLoadMoreButton = loadMoreButton.cloneNode(true);
        
        // Add the click handler
        newLoadMoreButton.addEventListener('click', () => {
            console.log('Load more button clicked');
            processNextBatch();
        });
        
        document.getElementById('gallery').appendChild(newLoadMoreButton);
        console.log('New load more button added');
    } else {
        console.log('No more images to load');
    }
}


function updateImageCount(count) {
    console.log(`Updating image count: ${count}`);
    document.getElementById('imageCount').textContent = 
        `Displaying ${count} image${count !== 1 ? 's' : ''}`;
}

function handleAuthClick() {
    console.log('Auth click handler started');
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        console.log('Authorization successful');
        document.getElementById('authorize-button').style.display = 'none';
        await listFiles();
    };

    if (gapi.client.getToken() === null) {
        console.log('Requesting access token with consent');
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        console.log('Requesting access token without consent');
        tokenClient.requestAccessToken({prompt: ''});
    }
}

function handleRefreshClick() {
    console.log('Refresh clicked');
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
                console.log(`Deleted cache: ${cacheName}`);
            });
        });
    }
    
    console.log('Starting refresh...');
    listFiles();
}

document.getElementById('authorize-button').addEventListener('click', handleAuthClick);
document.getElementById('refresh-button').addEventListener('click', handleRefreshClick);

// Refresh every 5 minutes
console.log('Setting up auto-refresh interval');
setInterval(listFiles, 300000);