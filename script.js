// script.js
let map;
let routingControl = null;
let userLocationMarker = null;
let currentRoutingMode = null; 

let tempStartWaypoint = null;
let tempEndWaypoint = null;
let tempStartMarker = null;
let tempEndMarker = null;
let searchMarker = null; // Variabel untuk menyimpan marker hasil pencarian

// === IKON-IKON KUSTOM ===
const userLocationIcon = L.icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const startPointIcon = L.icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const endPointIcon = L.icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const busStopIcon = L.icon({
    iconUrl: 'https://api.iconify.design/mdi/bus-stop.svg?color=%233388ff',
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30]
});
const terminalIcon = L.icon({
    iconUrl: 'https://api.iconify.design/ic/twotone-directions-bus.svg?color=%23d45a00',
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
});
const stationIcon = L.icon({
    iconUrl: 'https://api.iconify.design/mdi/train.svg?color=%23555555',
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30]
});

document.addEventListener('DOMContentLoaded', () => {
  initializeMap();
  setupRoutingButtons();
  setupClearRouteButton();
  setupRunRouteButton();
  updateWaypointStatus('Belum Dipilih', 'Belum Dipilih');
});

async function initializeMap() {
  const defaultCenter = [-7.2575, 112.7521];
  const defaultZoom = 13;
  
  if (map) map.remove();
  
  map = L.map('map').setView(defaultCenter, defaultZoom);
  const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  }).addTo(map);
  proj4.defs("EPSG:32749", "+proj=utm +zone=49 +south +ellps=WGS84 +datum=WGS84 +units=m +no_defs");

  try {
    const [sitesResponse, busStopsResponse, terminalsResponse, stationsResponse, cityBoundaryResponse, populationDensityResponse] = await Promise.all([
      fetch('data/surabayapoint.geojson'),
      fetch('halte.json'),
      fetch('data/Terminal.geojson'),
      fetch('data/Stasiun.geojson'),
      fetch('data/batas_kota.geojson'),
      fetch('data/kepadatan_penduduk.geojson')
    ]);

    const responses = [sitesResponse, busStopsResponse, terminalsResponse, stationsResponse, cityBoundaryResponse, populationDensityResponse];
    for (const response of responses) {
        if (!response.ok) throw new Error(`Gagal memuat data dari: ${response.url}`);
    }

    const sitesData = await sitesResponse.json();
    const busStopsData = await busStopsResponse.json();
    const terminalsData = await terminalsResponse.json();
    const stationsData = await stationsResponse.json();
    const cityBoundaryData = await cityBoundaryResponse.json();
    const populationData = await populationDensityResponse.json();

    // Layer Situs Sejarah
    const historicalSitesLayer = L.geoJSON(sitesData, {
      pointToLayer: (feature, latlng) => {
        const utmX = feature.geometry.coordinates[0];
        const utmY = feature.geometry.coordinates[1];
        try {
          const [lon, lat] = proj4("EPSG:32749", "EPSG:4326", [utmX, utmY]);
          return L.marker(L.latLng(lat, lon));
        } catch (e) {
          console.error(`[ERROR] Gagal konversi UTM untuk situs sejarah:`, e);
          return null;
        }
      },
      onEachFeature: (feature, layer) => {
        let popupContent = `<strong>${feature.properties.Nama || 'Lokasi'}</strong><br>${feature.properties.Alamat || ''}`;
        layer.bindPopup(popupContent);
        layer.on('click', e => {
          displayLocationInfo(feature.properties);
          handleMapClickForRouting(e.latlng, feature.properties.Nama);
        });
      }
    });

    // Layer Transportasi
    const halteGeoJsonFeatures = busStopsData.halte.map(halte => {
      const lat = parseFloat(halte.lat);
      const lon = parseFloat(halte.lon);
      if (isNaN(lat) || isNaN(lon)) return null;
      return {
        type: "Feature",
        properties: { name: halte.nama, description: halte.description },
        geometry: { type: "Point", coordinates: [lon, lat] }
      };
    }).filter(feature => feature !== null);

    const busStopLayer = L.geoJSON(halteGeoJsonFeatures, {
        pointToLayer: (feature, latlng) => L.marker(latlng, { icon: busStopIcon }),
        onEachFeature: (feature, layer) => {
            const props = feature.properties;
            layer.bindPopup(`<strong>Halte: ${props.name}</strong>`).on('click', e => handleMapClickForRouting(e.latlng, props.name));
        }
    });
    const terminalsLayer = L.geoJSON(terminalsData, {
        pointToLayer: (feature, latlng) => L.marker(latlng, { icon: terminalIcon }),
        onEachFeature: (feature, layer) => {
            const name = feature.properties.NAMOBJ || 'Terminal';
            layer.bindPopup(`<strong>Terminal: ${name}</strong>`).on('click', e => handleMapClickForRouting(e.latlng, name));
        }
    });
    const stationsLayer = L.geoJSON(stationsData, {
        pointToLayer: (feature, latlng) => L.marker(latlng, { icon: stationIcon }),
        onEachFeature: (feature, layer) => {
            const name = feature.properties.NAMOBJ || 'Stasiun';
            layer.bindPopup(`<strong>Stasiun: ${name}</strong>`).on('click', e => handleMapClickForRouting(e.latlng, name));
        }
    });
    const cityBoundaryLayer = L.geoJSON(cityBoundaryData, {
        style: { color: "#0033cc", weight: 2, opacity: 0.8, fillColor: "#3388ff", fillOpacity: 0.1, interactive: false }
    });

    // =======================================================
    // BAGIAN KEPADATAN PENDUDUK (UNIT ASLI: JIWA / HEKTAR)
    // =======================================================
    let populationInfo = L.control({position: 'topright'});
    let populationLayer;
    
    populationInfo.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info-kepadatan');
        this.update();
        return this._div;
    };
    
    populationInfo.update = function (props) {
        const densityValue = props ? props.kep_pend : 0;
        this._div.innerHTML = '<h4>Kepadatan Penduduk</h4>' +  (props ?
            '<b>' + (props.WADMKC || 'Data tidak tersedia') + '</b><br />' + (densityValue || 0).toLocaleString('id-ID', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + ' jiwa / hektar'
            : 'Arahkan ke salah satu wilayah');
    };
    
    function getColor(d) {
        return d > 300 ? '#800026' : // Sangat Padat
               d > 250 ? '#BD0026' :
               d > 200 ? '#E31A1C' :
               d > 150 ? '#FC4E2A' :
               d > 100 ? '#FD8D3C' :
               d > 50  ? '#FEB24C' :
               d > 10  ? '#FED976' :
                         '#FFEDA0'; // Kurang Padat
    }

    function stylePopulation(feature) {
        return {
            fillColor: getColor(feature.properties.kep_pend), 
            weight: 2, opacity: 1, color: 'white', dashArray: '3', fillOpacity: 0.7
        };
    }

    function highlightFeature(e) {
        const layer = e.target;
        layer.setStyle({ weight: 4, color: '#333', dashArray: '' });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }
        populationInfo.update(layer.feature.properties);
    }
    function resetHighlight(e) {
        populationLayer.resetStyle(e.target);
        populationInfo.update();
    }
    function zoomToFeature(e) { map.fitBounds(e.target.getBounds()); }

    populationLayer = L.geoJSON(populationData, {
        style: stylePopulation,
        onEachFeature: (feature, layer) => {
            layer.on({ mouseover: highlightFeature, mouseout: resetHighlight, click: zoomToFeature });
            
            const label = feature.properties.WADMKC;
            if (label) {
                layer.bindTooltip(label, {
                    permanent: true,
                    direction: 'center',
                    className: 'polygon-label'
                });
            }
        }
    });

    let legend = L.control({position: 'bottomright'});
    legend.onAdd = function (map) {
        let div = L.DomUtil.create('div', 'info-kepadatan legend'),
            grades = [0, 10, 50, 100, 150, 200, 250, 300]; 
        
        div.innerHTML += '<strong>Jiwa / Hektar</strong><br>';
        for (let i = 0; i < grades.length; i++) {
            div.innerHTML +=
                '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
                grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
        }
        return div;
    };
    
    populationLayer.on('add', () => { populationInfo.addTo(map); legend.addTo(map); });
    populationLayer.on('remove', () => { map.removeControl(populationInfo); map.removeControl(legend); });
    
    // --- KONTROL LAYER ---
    historicalSitesLayer.addTo(map); 
    cityBoundaryLayer.addTo(map);
    cityBoundaryLayer.bringToBack(); 

    const baseMaps = { "Peta Dasar": tileLayer };
    const overlayMaps = {
      "📊 Kepadatan Penduduk": populationLayer,
      "🏛️ Situs Sejarah": historicalSitesLayer,
      "🚏 Halte Bus": busStopLayer,
      "🚌 Terminal": terminalsLayer,
      "🚉 Stasiun": stationsLayer
    };

    // === PEMBARUAN DI SINI: MENAMBAHKAN FITUR PENCARIAN (GEOCODER) ===
    L.Control.geocoder({
        placeholder: 'Cari alamat atau tempat...',
        defaultMarkGeocode: false // Kita akan tangani marker secara manual
    }).on('markgeocode', function(e) {
        const latlng = e.geocode.center;
        const name = e.geocode.name;
        
        // Hapus marker pencarian sebelumnya jika ada
        if (searchMarker) {
            map.removeLayer(searchMarker);
        }

        // Buat marker baru untuk hasil pencarian
        searchMarker = L.marker(latlng).addTo(map)
            .bindPopup(name)
            .openPopup();
        
        // Pusatkan peta pada hasil pencarian
        map.setView(latlng, 16);

    }).addTo(map);
    // ===============================================================

    L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);
    map.on('click', e => handleMapClickForRouting(e.latlng, 'Titik Dipilih'));

  } catch (error) {
    console.error('[ERROR] Inisialisasi peta atau GeoJSON gagal:', error);
    document.getElementById('map').innerHTML = '<p style="color:red; text-align:center;">Gagal memuat data peta. Silakan coba lagi nanti.</p>';
  }
}

// ... Sisa kode lainnya (fungsi routing, dll.) tidak perlu diubah ...
function displayLocationInfo(properties) {
    let panelHtml = `<h3>${properties.Nama || 'Info Lokasi'}</h3>` +
                    `<p><strong>Alamat:</strong> ${properties.Alamat || 'Tidak ada data'}</p>` +
                    (properties.deskripsi_singkat ? `<p><strong>Deskripsi:</strong> ${properties.deskripsi_singkat}</p>` : '') +
                    (properties.sejarah_singkat ? `<p><strong>Sejarah:</strong> ${properties.sejarah_singkat}</p>` : '');
    if (properties.gambar_url) {
        panelHtml = `<img src="${properties.gambar_url}" alt="${properties.Nama || ''}" style="width:100%;border-radius:8px;margin-bottom:15px;">` + panelHtml;
    }
    document.getElementById('info-content').innerHTML = panelHtml;
}

function setupRoutingButtons() {
    document.getElementById('route-from-me-btn').addEventListener('click', () => setRoutingMode('from_me'));
    document.getElementById('route-by-click-btn').addEventListener('click', () => setRoutingMode('by_click'));
    document.getElementById('custom-route-btn').addEventListener('click', () => setRoutingMode('custom'));
}

function setupClearRouteButton() {
    document.getElementById('clear-route-btn').addEventListener('click', clearAllRoutingData);
}

function setupRunRouteButton() {
    document.getElementById('run-route-btn').addEventListener('click', runRoute);
}

function setRoutingMode(mode) {
    clearAllRoutingData(false);
    currentRoutingMode = mode;
    updateWaypointStatus('Belum Dipilih', 'Belum Dipilih');
    let message = '';
    if (mode === 'from_me') {
        message = 'Mode "Dari Lokasi Saya" aktif. Klik titik tujuan di peta, lalu "Run Rute".';
        getAndDisplayUserLocation();
    } else {
        message = 'Mode rute kustom aktif. Klik titik awal, lalu titik tujuan di peta.';
        alert(message);
    }
    document.getElementById('directions-content').innerHTML = `<p>${message}</p>`;
}

function handleMapClickForRouting(latlng, name) {
    if (!currentRoutingMode) return;

    if (!tempStartWaypoint) {
        tempStartWaypoint = L.Routing.waypoint(latlng, name);
        if(tempStartMarker) map.removeLayer(tempStartMarker);
        tempStartMarker = L.marker(latlng, {icon: startPointIcon}).addTo(map).bindPopup(`<b>Titik Awal:</b> ${name}`).openPopup();
        updateWaypointStatus(name, 'Belum Dipilih');
        document.getElementById('directions-content').innerHTML = '<p>Titik Awal diset. Sekarang klik titik Tujuan.</p>';
    } else if (!tempEndWaypoint) {
        tempEndWaypoint = L.Routing.waypoint(latlng, name);
        if(tempEndMarker) map.removeLayer(tempEndMarker);
        tempEndMarker = L.marker(latlng, {icon: endPointIcon}).addTo(map).bindPopup(`<b>Titik Tujuan:</b> ${name}`).openPopup();
        updateWaypointStatus(tempStartWaypoint.name, name);
        document.getElementById('directions-content').innerHTML = '<p>Titik Tujuan diset. Klik "Run Rute" untuk membuat rute.</p>';
    } else {
        alert('Titik awal dan tujuan sudah dipilih. Klik "Run Rute" atau "Hapus Rute" untuk memulai ulang.');
    }
}

function getAndDisplayUserLocation() {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const myLatLng = L.latLng(position.coords.latitude, position.coords.longitude);
            if (userLocationMarker) map.removeLayer(userLocationMarker);
            userLocationMarker = L.marker(myLatLng, { icon: userLocationIcon }).addTo(map).bindPopup("<b>Lokasi Saya</b>").openPopup();
            map.setView(myLatLng, 15);
            tempStartWaypoint = L.Routing.waypoint(myLatLng, 'Lokasi Saya');
            updateWaypointStatus('Lokasi Saya', tempEndWaypoint ? tempEndWaypoint.name : 'Belum Dipilih');
            document.getElementById('directions-content').innerHTML = '<p>Lokasi Anda ditemukan. Sekarang klik titik tujuan di peta.</p>';
        },
        handleGeolocationError,
        { enableHighAccuracy: true }
    );
}

function runRoute() {
    if (!tempStartWaypoint || !tempEndWaypoint) {
        alert('Mohon tentukan titik awal dan titik tujuan terlebih dahulu.');
        return;
    }
    initializeRoutingControl([tempStartWaypoint, tempEndWaypoint]);
}

function initializeRoutingControl(waypoints) {
    if (routingControl) {
        map.removeControl(routingControl);
    }

    const directionsContentDiv = document.getElementById('directions-content');
    directionsContentDiv.innerHTML = '<p>Mencari rute terbaik...</p>';

    routingControl = L.Routing.control({
        waypoints: waypoints,
        lineOptions: {
            styles: [{ color: 'red', opacity: 0.9, weight: 6 }]
        },
        createMarker: function() { return null; },
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1'
        }),
        show: false,
        addWaypoints: false
    })
    .on('routesfound', function(e) {
        directionsContentDiv.innerHTML = '';
        
        const route = e.routes[0];
        const summary = route.summary;

        const summaryDiv = L.DomUtil.create('div', 'custom-routing-summary', directionsContentDiv);
        summaryDiv.innerHTML = `<h3>Ringkasan Rute Kendaraan</h3>
                                <p><strong>Jarak:</strong> ${(summary.totalDistance / 1000).toFixed(2)} km</p>
                                <p><strong>Waktu:</strong> ${Math.round(summary.totalTime / 60)} menit</p>`;

        const instructionsDiv = L.DomUtil.create('div', 'custom-routing-instructions', directionsContentDiv);
        instructionsDiv.innerHTML = '<h4>Petunjuk Arah Lengkap:</h4>';
        const instructionsList = L.DomUtil.create('ol', '', instructionsDiv);

        route.instructions.forEach(function(instr) {
            const li = L.DomUtil.create('li', '', instructionsList);
            li.innerHTML = `${instr.text} <span>(${(instr.distance / 1000).toFixed(2)} km)</span>`;
        });
    })
    .on('routingerror', function(e) {
        directionsContentDiv.innerHTML = `<p style="color: red;">Maaf, rute tidak dapat ditemukan.</p>`;
        console.error("Routing error:", e);
        alert("Gagal menemukan rute. Mungkin tidak ada jalan yang tersedia di antara dua titik tersebut.");
    })
    .addTo(map);
}


function clearAllRoutingData(resetMode = true) {
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
    if (userLocationMarker) map.removeLayer(userLocationMarker);
    if (tempStartMarker) map.removeLayer(tempStartMarker);
    if (tempEndMarker) map.removeLayer(tempEndMarker);
    
    userLocationMarker = tempStartMarker = tempEndMarker = null;
    tempStartWaypoint = tempEndWaypoint = null;

    if (resetMode) currentRoutingMode = null;
    
    document.getElementById('directions-content').innerHTML = '<p>Pilih mode rute dan titik di peta, lalu klik "Run Rute".</p>';
    updateWaypointStatus('Belum Dipilih', 'Belum Dipilih');
}

function updateWaypointStatus(startName, endName) {
    document.getElementById('start-point-name').textContent = startName;
    document.getElementById('end-point-name').textContent = endName;
}

function handleGeolocationError(error) {
    alert(`Error Geolocation: ${error.message}`);
}