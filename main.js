// Modelo de datos
    let playlist = [];
    let currentTrackIndex = 0;
    let audio = new Audio();
    let isPlaying = false;
    let currentFilter = 'all';
    
    // Claves para localStorage
    const STORAGE_KEYS = {
        PLAYLIST: 'harmonicPlayer_playlist',
        CURRENT_TRACK: 'harmonicPlayer_currentTrack',
        VOLUME: 'harmonicPlayer_volume',
        BACKGROUND: 'harmonicPlayer_background'
    };
    
    // Elementos DOM
    const fileInput = document.getElementById('fileInput');
    const playlistContainer = document.getElementById('playlistContainer');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const currentTimeSpan = document.getElementById('currentTime');
    const durationSpan = document.getElementById('duration');
    const volumeSlider = document.getElementById('volumeSlider');
    const currentTitleSpan = document.getElementById('currentTitle');
    const currentKeySpan = document.getElementById('currentKey');
    const coverArtDiv = document.getElementById('coverArt');
    const sortCamelotBtn = document.getElementById('sortCamelotBtn');
    const clearPlaylistBtn = document.getElementById('clearPlaylistBtn');
    const bgUrlInput = document.getElementById('bgUrlInput');
    const applyBgBtn = document.getElementById('applyBgBtn');
    const uploadLocalBgBtn = document.getElementById('uploadLocalBgBtn');
    const localBgInput = document.getElementById('localBgInput');
    const appContainer = document.getElementById('appContainer');
    const statusBadge = document.getElementById('statusBadge');

    // Obtener números de Camelot (1-12) y letra (A/B)
    function parseCamelot(key) {
        if (!key) return null;
        const match = key.match(/^([1-9]|1[0-2])(A|B)$/i);
        if (match) {
            return {
                number: parseInt(match[1]),
                letter: match[2].toUpperCase()
            };
        }
        return null;
    }

    // Obtener claves compatibles según la Rueda de Camelot
    // Patrones: misma clave, relativo, ±1, ±2, ±5
    function getCompatibleKeys(key) {
        const parsed = parseCamelot(key);
        if (!parsed) return [];
        
        const { number, letter } = parsed;
        const compatibles = new Map(); // Usar Map para guardar también el tipo
        
        // Función auxiliar para añadir compatible
        function addCompatible(num, let, type) {
            let n = num;
            if (n > 12) n = n - 12;
            if (n < 1) n = n + 12;
            const keyStr = `${n}${let}`;
            if (!compatibles.has(keyStr)) {
                compatibles.set(keyStr, type);
            }
        }
        
        // 1. Misma clave (1A -> 1A)
        addCompatible(number, letter, 'perfect');
        
        // 2. Relativo menor/mayor (1A -> 1B, 2B -> 2A)
        const oppositeLetter = letter === 'A' ? 'B' : 'A';
        addCompatible(number, oppositeLetter, 'relative');
        
        // 3. +/-1 en el círculo (mismo tipo de energía)
        addCompatible(number + 1, letter, 'energy');
        addCompatible(number - 1, letter, 'energy');
        
        // 4. +/-2 en el círculo (cambio de tonalidad completa)
        addCompatible(number + 2, letter, 'tonal');
        addCompatible(number - 2, letter, 'tonal');
        
        // 5. +/-5 en el círculo (mezcla avanzada - misma letra)
        addCompatible(number + 5, letter, 'five-step');
        addCompatible(number - 5, letter, 'five-step');
        
        return compatibles;
    }

    // Obtener sugerencias de mezcla para una canción
    function getMixSuggestions(track, allTracks) {
        if (!track.key) return [];
        
        const compatibleKeys = getCompatibleKeys(track.key);
        const suggestions = [];
        
        for (let i = 0; i < allTracks.length; i++) {
            const other = allTracks[i];
            if (other === track) continue;
            if (!other.key) continue;
            
            const compatType = compatibleKeys.get(other.key);
            if (compatType) {
                suggestions.push({
                    index: i,
                    name: other.name,
                    key: other.key,
                    type: compatType
                });
            }
        }
        
        return suggestions;
    }

    function showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.background = isError ? 'rgba(244, 67, 54, 0.95)' : 'rgba(76, 175, 80, 0.95)';
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // Extraer tonalidad del nombre
    function extractKeyFromFilename(filename) {
        let nameWithoutExt = filename.replace(/\.(mp3|wav|ogg)$/i, '');
        let tokens = nameWithoutExt.split(/[\s\-_]+/);
        let camelotPattern = /^([1-9]|1[0-2])(A|B)$/i;
        
        for (let i = tokens.length - 1; i >= 0; i--) {
            let token = tokens[i].toUpperCase();
            if (camelotPattern.test(token)) {
                return token;
            }
        }
        
        let lastPart = nameWithoutExt.match(/([1-9]|1[0-2])(A|B)$/i);
        if (lastPart) {
            return lastPart[0].toUpperCase();
        }
        
        return null;
    }

    // Ordenar por Camelot
    function sortByCamelot(tracks) {
        const orderValue = (key) => {
            if (!key) return 9999;
            let match = key.match(/^([1-9]|1[0-2])(A|B)$/i);
            if (match) {
                let num = parseInt(match[1]);
                let letter = match[2].toUpperCase();
                return (num * 2) + (letter === 'B' ? 1 : 0);
            }
            return 9999;
        };
        return [...tracks].sort((a, b) => orderValue(a.key) - orderValue(b.key));
    }

    // Guardar sesión
    function saveSession() {
        try {
            const playlistData = playlist.map(track => ({
                name: track.name,
                key: track.key,
                fileName: track.fileName
            }));
            localStorage.setItem(STORAGE_KEYS.PLAYLIST, JSON.stringify(playlistData));
            localStorage.setItem(STORAGE_KEYS.CURRENT_TRACK, currentTrackIndex);
            localStorage.setItem(STORAGE_KEYS.VOLUME, audio.volume);
        } catch (e) {
            console.error('Error guardando:', e);
        }
    }

    // Cargar sesión
    function loadSession() {
        try {
            const savedVolume = localStorage.getItem(STORAGE_KEYS.VOLUME);
            if (savedVolume !== null) {
                audio.volume = parseFloat(savedVolume);
                volumeSlider.value = audio.volume;
            }
            
            const savedBackground = localStorage.getItem(STORAGE_KEYS.BACKGROUND);
            if (savedBackground && savedBackground !== 'none' && savedBackground !== '') {
                appContainer.style.backgroundImage = savedBackground;
                appContainer.style.backgroundSize = 'cover';
                appContainer.style.backgroundPosition = 'center';
                appContainer.style.backgroundAttachment = 'fixed';
            }
        } catch (e) {
            console.error('Error cargando:', e);
        }
    }

    // Renderizar playlist con sugerencias armónicas
    function renderPlaylist() {
        if (playlist.length === 0) {
            playlistContainer.innerHTML = '<div style="color:rgba(255,255,255,0.6); text-align:center; padding:2rem;">🎵 No hay canciones. Carga archivos de audio 🎵</div>';
            return;
        }
        
        let filteredPlaylist = playlist;
        if (currentFilter === 'compatible' && playlist[currentTrackIndex] && playlist[currentTrackIndex].key) {
            const compatibleKeys = getCompatibleKeys(playlist[currentTrackIndex].key);
            filteredPlaylist = playlist.filter(track => {
                if (track === playlist[currentTrackIndex]) return true;
                return track.key && compatibleKeys.has(track.key);
            });
        }
        
        playlistContainer.innerHTML = '';
        
        filteredPlaylist.forEach((track, displayIdx) => {
            const originalIdx = playlist.indexOf(track);
            const div = document.createElement('div');
            div.className = 'track-item';
            if (originalIdx === currentTrackIndex) div.classList.add('active');
            
            const suggestions = getMixSuggestions(track, playlist);
            
            // Texto descriptivo del tipo de mezcla
            const getTypeLabel = (type) => {
                switch(type) {
                    case 'perfect': return '🎯 Perfecta';
                    case 'relative': return '🔄 Relativa';
                    case 'energy': return '⚡ ±1 Energía';
                    case 'tonal': return '🎵 ±2 Tonal';
                    case 'five-step': return '🌈 ±5 Avanzado';
                    default: return '🎧 Mezcla';
                }
            };
            
            div.innerHTML = `
                <div class="track-main">
                    <div class="track-cover-mini">🎵</div>
                    <div class="track-info">
                        <div class="track-name">${escapeHtml(track.name)}</div>
                        <div class="track-key-badge">${track.key || 'Sin tonalidad'}</div>
                    </div>
                </div>
                ${suggestions.length > 0 ? `
                    <div class="harmonic-suggestions">
                        <span style="font-size:0.65rem; opacity:0.7;">🎛️ Mezcla armónica con:</span>
                        ${suggestions.map(sug => `
                            <span class="harmony-tag ${sug.type}" data-index="${sug.index}" title="${getTypeLabel(sug.type)}">
                                ${sug.name.substring(0, 18)} (${sug.key})
                            </span>
                        `).join('')}
                    </div>
                ` : track.key ? `
                    <div class="harmonic-suggestions">
                        <span style="font-size:0.65rem; opacity:0.5;">⚠️ No hay mezclas compatibles en la playlist</span>
                    </div>
                ` : ''}
            `;
            
            div.querySelector('.track-main')?.addEventListener('click', () => {
                loadTrack(originalIdx);
                setTimeout(() => playAudio(), 100);
            });
            
            div.querySelectorAll('.harmony-tag').forEach(tag => {
                tag.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(tag.dataset.index);
                    if (!isNaN(idx)) {
                        loadTrack(idx);
                        setTimeout(() => playAudio(), 100);
                        const sugType = tag.classList.contains('perfect') ? 'perfecta' :
                                      tag.classList.contains('relative') ? 'relativa' :
                                      tag.classList.contains('energy') ? 'de energía (±1)' :
                                      tag.classList.contains('tonal') ? 'tonal (±2)' :
                                      tag.classList.contains('five-step') ? 'avanzada (±5)' : '';
                        showToast(`🎵 Mezclando con: ${playlist[idx].name} (${sugType})`);
                    }
                });
            });
            
            playlistContainer.appendChild(div);
        });
        
        saveSession();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function loadTrack(index) {
        if (index < 0 || index >= playlist.length) return;
        
        currentTrackIndex = index;
        let track = playlist[currentTrackIndex];
        
        const wasPlaying = isPlaying;
        
        if (isPlaying) {
            audio.pause();
        }
        
        if (audio.src) {
            audio.src = '';
        }
        
        if (track.blobUrl) {
            audio.src = track.blobUrl;
            audio.load();
            
            currentTitleSpan.innerText = track.name;
            currentKeySpan.innerText = track.key || 'Sin Key';
            coverArtDiv.innerHTML = `<div class="cover-placeholder">🎵<br><span style="font-size: 0.7rem;">${track.name.substring(0, 20)}</span></div>`;
            
            renderPlaylist();
            
            audio.addEventListener('canplaythrough', function onCanPlay() {
                audio.removeEventListener('canplaythrough', onCanPlay);
                if (wasPlaying) {
                    playAudio();
                }
            }, { once: true });
            
            audio.addEventListener('error', function onError() {
                audio.removeEventListener('error', onError);
                showToast(`Error al cargar: ${track.name}`, true);
            }, { once: true });
        }
    }

    function playAudio() {
        if (!audio.src || playlist.length === 0) {
            if (playlist.length === 0) {
                showToast('No hay canciones en la playlist', true);
            }
            return;
        }
        
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                isPlaying = true;
                playPauseBtn.innerHTML = '⏸️';
                saveSession();
            }).catch((error) => {
                console.log('Error al reproducir:', error);
                isPlaying = false;
                playPauseBtn.innerHTML = '▶️';
                if (error.name === 'NotSupportedError') {
                    showToast('Formato de audio no soportado', true);
                } else {
                    showToast('Error al reproducir', true);
                }
            });
        }
    }
    
    function pauseAudio() {
        audio.pause();
        isPlaying = false;
        playPauseBtn.innerHTML = '▶️';
        saveSession();
    }

    function updateProgress() {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
            let percent = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = percent + '%';
            currentTimeSpan.innerText = formatTime(audio.currentTime);
            durationSpan.innerText = formatTime(audio.duration);
        }
    }
    
    function formatTime(sec) {
        if (isNaN(sec) || !isFinite(sec)) return '0:00';
        let mins = Math.floor(sec / 60);
        let seconds = Math.floor(sec % 60);
        return `${mins}:${seconds < 10 ? '0' + seconds : seconds}`;
    }

    async function handleAudioFiles(files) {
        let completed = 0;
        const validFiles = files.filter(f => f.type.includes('audio'));
        
        if (validFiles.length === 0) {
            showToast('No se encontraron archivos de audio válidos', true);
            return;
        }
        
        showToast(`Cargando ${validFiles.length} archivo(s)...`);
        
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            const key = extractKeyFromFilename(file.name);
            const name = file.name.replace(/\.(mp3|wav|ogg)$/i, '');
            
            try {
                const blobUrl = URL.createObjectURL(file);
                playlist.push({
                    name: name,
                    key: key,
                    blobUrl: blobUrl,
                    fileName: file.name
                });
                completed++;
            } catch (error) {
                console.error('Error:', error);
                showToast(`Error procesando ${name}`, true);
            }
        }
        
        if (playlist.length > 0 && (!audio.src || currentTrackIndex === 0)) {
            currentTrackIndex = 0;
            loadTrack(0);
        }
        
        renderPlaylist();
        saveSession();
        
        showToast(`${completed} archivo(s) cargado(s) correctamente`);
        
        if (playlist.length > 0 && playlist[currentTrackIndex]?.key) {
            const suggestions = getMixSuggestions(playlist[currentTrackIndex], playlist);
            if (suggestions.length > 0) {
                const fiveStepCount = suggestions.filter(s => s.type === 'five-step').length;
                showToast(`🎛️ ${suggestions.length} mezclas compatibles (${fiveStepCount} son ±5)`);
            }
        }
    }

    function setBackgroundFromUrl(url) {
        let bgStyle = `url('${url}')`;
        appContainer.style.backgroundImage = bgStyle;
        appContainer.style.backgroundSize = 'cover';
        appContainer.style.backgroundPosition = 'center';
        localStorage.setItem(STORAGE_KEYS.BACKGROUND, bgStyle);
        showToast('Fondo actualizado');
    }

    // Event Listeners
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleAudioFiles(Array.from(e.target.files));
        }
        fileInput.value = '';
    });
    
    playPauseBtn.addEventListener('click', () => {
        if (playlist.length === 0) {
            showToast('Primero carga archivos de audio', true);
            return;
        }
        
        if (audio.paused || !isPlaying) {
            playAudio();
        } else {
            pauseAudio();
        }
    });
    
    prevBtn.addEventListener('click', () => {
        if (playlist.length) {
            let newIdx = (currentTrackIndex - 1 + playlist.length) % playlist.length;
            loadTrack(newIdx);
            setTimeout(() => playAudio(), 200);
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (playlist.length) {
            let newIdx = (currentTrackIndex + 1) % playlist.length;
            loadTrack(newIdx);
            setTimeout(() => playAudio(), 200);
        }
    });
    
    progressContainer.addEventListener('click', (e) => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
            let rect = progressContainer.getBoundingClientRect();
            let perc = (e.clientX - rect.left) / rect.width;
            audio.currentTime = perc * audio.duration;
            saveSession();
        }
    });
    
    volumeSlider.addEventListener('input', (e) => {
        audio.volume = parseFloat(e.target.value);
        saveSession();
    });
    
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', () => {
        if (playlist.length) {
            let newIdx = (currentTrackIndex + 1) % playlist.length;
            loadTrack(newIdx);
            setTimeout(() => playAudio(), 200);
        }
    });
    
    audio.addEventListener('loadedmetadata', () => {
        durationSpan.innerText = formatTime(audio.duration);
    });
    
    sortCamelotBtn.addEventListener('click', () => {
        if (playlist.length) {
            playlist = sortByCamelot(playlist);
            renderPlaylist();
            const currentTrack = playlist.find(t => t === playlist[currentTrackIndex]);
            if (currentTrack) {
                currentTrackIndex = playlist.indexOf(currentTrack);
            } else {
                currentTrackIndex = 0;
                loadTrack(0);
            }
            showToast('Playlist ordenada por Camelot');
        }
    });
    
    clearPlaylistBtn.addEventListener('click', () => {
        if (confirm('¿Limpiar toda la playlist?')) {
            for (let track of playlist) {
                if (track.blobUrl) {
                    URL.revokeObjectURL(track.blobUrl);
                }
            }
            playlist = [];
            currentTrackIndex = 0;
            audio.pause();
            audio.src = '';
            isPlaying = false;
            playPauseBtn.innerHTML = '▶️';
            currentTitleSpan.innerText = 'Sin canción';
            currentKeySpan.innerText = '-';
            coverArtDiv.innerHTML = '<div class="cover-placeholder">🎧</div>';
            progressBar.style.width = '0%';
            currentTimeSpan.innerText = '0:00';
            durationSpan.innerText = '0:00';
            renderPlaylist();
            saveSession();
            showToast('Playlist limpiada');
        }
    });
    
    applyBgBtn.addEventListener('click', () => {
        let url = bgUrlInput.value.trim();
        if (url) {
            setBackgroundFromUrl(url);
            bgUrlInput.value = '';
        } else {
            showToast('Ingresa una URL válida', true);
        }
    });
    
    uploadLocalBgBtn.addEventListener('click', () => {
        localBgInput.click();
    });
    
    localBgInput.addEventListener('change', (e) => {
        let file = e.target.files[0];
        if (file) {
            let url = URL.createObjectURL(file);
            setBackgroundFromUrl(url);
        }
    });
    
    // Filtros
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.dataset.filter;
            renderPlaylist();
        });
    });
    
    statusBadge.addEventListener('click', () => {
        if (playlist[currentTrackIndex]?.key) {
            const suggestions = getMixSuggestions(playlist[currentTrackIndex], playlist);
            const fiveStepCount = suggestions.filter(s => s.type === 'five-step').length;
            showToast(`🎛️ ${suggestions.length} mezclas (${fiveStepCount} son ±5 avanzadas)`);
        } else {
            showToast(`📊 ${playlist.length} canciones | Volumen: ${Math.round(audio.volume * 100)}%`);
        }
    });
    
    // Inicialización
    function init() {
        appContainer.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        audio.volume = 0.8;
        volumeSlider.value = 0.8;
        loadSession();
        console.log('🎵 Harmonic Player con Mezcla Armónica (±5 incluido) cargado');
        showToast('🎛️ Mezcla Armónica Camelot con ±5 activada!');
    }
    
    init();