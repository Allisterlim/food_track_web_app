// Constants
const BATCH_SIZE = 10;

// State management
let currentlyLoading = false;
let processedItems = new Set();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadGalleryData();
    // Refresh every 5 minutes
    setInterval(loadGalleryData, 300000);
});

async function loadGalleryData() {
    console.log('Starting to load gallery data...');
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '<div id="loading" class="loading">Loading fresh images...</div>';
    
    try {
        const response = await fetch('/api/gallery-data');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        processedItems.clear();
        currentlyLoading = false;
        gallery.innerHTML = '';

        // Display initial batch
        await displayNextBatch(data.dates);
        
        updateImageCount(data.totalImages);
        document.getElementById('refresh-button').style.display = 'block';
        
    } catch (err) {
        console.error('Error loading gallery data:', err);
        if (err.message.includes('401') || err.message.includes('403')) {
            window.location.href = '/authorize';
        } else {
            gallery.innerHTML = '<div class="error">Error loading images. Please try refreshing.</div>';
        }
    }
}

function displayDateSection(date, items) {
    const gallery = document.getElementById('gallery');
    
    // Remove existing load more button if present
    const existingButton = document.getElementById('load-more-button');
    if (existingButton) {
        existingButton.remove();
    }

    // Check for existing date section
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
            dateContainer = document.createElement('div');
            dateContainer.className = 'date-container';
            dateSection.appendChild(dateContainer);
        }
    } else {
        // Create new date section
        dateSection = document.createElement('div');
        dateSection.className = 'date-section';
        
        // Create header with date and calorie information
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.innerHTML = `
            <div class="date-header-content">
                <div class="date-text">${date}</div>
                <div class="calorie-total">Total Calories: ${items.totalCalories} kcal (${items.itemCount} items)</div>
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

    // Add items to container
    items.data.forEach(item => {
        if (!processedItems.has(item.id)) {
            const containerDiv = document.createElement('div');
            containerDiv.className = 'gallery-item';
            
            // Create image
            const img = document.createElement('img');
            const timestamp = new Date().getTime();
            img.src = `/api/thumbnail/${item.id}?t=${timestamp}`;
            img.alt = item.name;
            img.loading = 'lazy';
            containerDiv.appendChild(img);
            
            // Create metadata section
            const dataDiv = document.createElement('div');
            dataDiv.className = 'metadata';
            
            // Build metadata content
            let content = `<div>Time: ${new Date(item.timestamp).toLocaleString()}</div>`;
            
            if (item.nutritionalInfo) {
                const nutInfo = item.nutritionalInfo;
                content += `
                    <div style="margin: 8px 0; padding: 8px; background-color: #f8f9fa; border-radius: 4px;">
                        <div>Total Weight: ${nutInfo.totalWeightGrams}g</div>
                        <div>Food Weight: ${nutInfo.foodWeightGrams}g</div>
                    </div>
                    <div class="food-name">${nutInfo.foodIdentified}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
                        <div>Calories: ${nutInfo.calories} kcal</div>
                        <div>Carbs: ${nutInfo.carbs}g</div>
                        <div>Protein: ${nutInfo.protein}g</div>
                        <div>Fat: ${nutInfo.fat}g</div>
                    </div>
                `;
            } else {
                content += `<div>Weight: ${item.weightGrams}g</div>`;
            }
            
            dataDiv.innerHTML = content;
            containerDiv.appendChild(dataDiv);
            dateContainer.appendChild(containerDiv);
            
            processedItems.add(item.id);
        }
    });

    updateLoadMoreButton();
}

async function displayNextBatch(dates) {
    if (currentlyLoading) {
        return;
    }

    currentlyLoading = true;
    const loadMoreButton = document.getElementById('load-more-button');
    if (loadMoreButton) {
        loadMoreButton.disabled = true;
        loadMoreButton.textContent = 'Loading...';
    }

    try {
        const unprocessedDates = Object.entries(dates)
            .filter(([date, items]) => 
                items.data.some(item => !processedItems.has(item.id))
            );

        if (unprocessedDates.length === 0) {
            currentlyLoading = false;
            updateLoadMoreButton();
            return;
        }

        // Take next batch of dates
        const batchDates = unprocessedDates.slice(0, BATCH_SIZE);
        
        for (const [date, items] of batchDates) {
            await displayDateSection(date, items);
        }

    } catch (error) {
        console.error('Error displaying batch:', error);
        const gallery = document.getElementById('gallery');
        gallery.innerHTML += '<div class="error">Error loading images. Please try refreshing.</div>';
    } finally {
        currentlyLoading = false;
        updateLoadMoreButton();
    }
}

function updateLoadMoreButton() {
    const existingButton = document.getElementById('load-more-button');
    if (existingButton) {
        existingButton.remove();
    }

    const gallery = document.getElementById('gallery');
    const allItems = Array.from(document.querySelectorAll('.gallery-item'));
    const totalProcessed = processedItems.size;
    
    if (totalProcessed < parseInt(gallery.dataset.totalItems || '0')) {
        const loadMoreButton = document.createElement('button');
        loadMoreButton.id = 'load-more-button';
        loadMoreButton.className = 'load-more-button';
        const remaining = parseInt(gallery.dataset.totalItems) - totalProcessed;
        loadMoreButton.textContent = `Load More (${remaining} items remaining)`;
        loadMoreButton.disabled = currentlyLoading;
        
        loadMoreButton.addEventListener('click', () => {
            const dates = JSON.parse(gallery.dataset.dates || '{}');
            displayNextBatch(dates);
        });
        
        gallery.appendChild(loadMoreButton);
    }
}

function updateImageCount(count) {
    document.getElementById('imageCount').textContent = 
        `Displaying ${count} image${count !== 1 ? 's' : ''}`;
}

function handleRefreshClick() {
    const loadMoreButton = document.getElementById('load-more-button');
    if (loadMoreButton) {
        loadMoreButton.remove();
    }
    
    processedItems.clear();
    currentlyLoading = false;
    
    if ('caches' in window) {
        caches.keys().then(cacheNames => {
            cacheNames.forEach(cacheName => {
                caches.delete(cacheName);
            });
        });
    }
    
    loadGalleryData();
}

// Event Listeners
document.getElementById('refresh-button').addEventListener('click', handleRefreshClick);