(() => {
    const BUTTON_BITS = {
        up: 0,
        down: 1,
        left: 2,
        right: 3,
        a: 4,
        b: 5,
        x: 6,
        y: 7,
        l: 8,
        r: 9,
        start: 10,
        select: 11
    };

    const KEY_BINDINGS = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        KeyZ: 'a',
        KeyX: 'b',
        KeyS: 'x',
        KeyA: 'y',
        KeyQ: 'l',
        KeyW: 'r',
        Enter: 'start',
        Space: 'start',
        Backspace: 'select',
        ShiftRight: 'select',
        ShiftLeft: 'select'
    };

    const connection = {
        device: null,
        server: null,
        characteristic: null,
        writeWithResponse: false
    };

    const buttonElements = new Map();
    const buttonSources = new Map();
    const activeKeys = new Set();

    let bitState = 0;
    let stateDirty = false;
    let writePending = false;
    let needsWrite = false;

    const connectionStatus = document.getElementById('connectionStatus');
    const lightBar = document.getElementById('lightBar');
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    const serviceInput = document.getElementById('serviceUuid');
    const characteristicInput = document.getElementById('characteristicUuid');
    const writeWithResponseCheckbox = document.getElementById('writeWithResponse');
    const logContent = document.getElementById('logContent');
    const connectionForm = document.getElementById('connectionForm');
    const controlPanel = document.getElementById('controlPanel');
    const mobileSettingsToggle = document.getElementById('mobileSettingsToggle');
    const settingsBackdrop = document.getElementById('settingsBackdrop');
    const mobileSheetMediaQuery =
        typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 720px)') : null;

    connectionForm?.addEventListener('submit', (event) => event.preventDefault());

    mobileSettingsToggle?.addEventListener('click', () => {
        if (!isSheetMode()) {
            return;
        }
        const nextOpenState = !controlPanel?.classList.contains('is-open');
        setSheetOpen(nextOpenState);
    });

    settingsBackdrop?.addEventListener('click', () => setSheetOpen(false));

    const handleSheetMediaChange = () => {
        syncSheetMode();
    };

    if (mobileSheetMediaQuery) {
        if (typeof mobileSheetMediaQuery.addEventListener === 'function') {
            mobileSheetMediaQuery.addEventListener('change', handleSheetMediaChange);
        } else if (typeof mobileSheetMediaQuery.addListener === 'function') {
            mobileSheetMediaQuery.addListener(handleSheetMediaChange);
        }
    }

    syncSheetMode();

    document.querySelectorAll('.control-button[data-button]').forEach((button) => {
        const name = button.dataset.button;
        if (!name) {
            return;
        }

        buttonElements.set(name, button);
        buttonSources.set(name, new Set());

        button.addEventListener('contextmenu', (event) => event.preventDefault());

        button.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            updateButtonPress(name, `pointer-${event.pointerId}`, true);
            if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
                navigator.vibrate(5);
            }
        });

        const release = (event) => {
            if (button.hasPointerCapture?.(event.pointerId)) {
                button.releasePointerCapture(event.pointerId);
            }
            updateButtonPress(name, `pointer-${event.pointerId}`, false);
        };

        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('lostpointercapture', release);
    });

    window.addEventListener('keydown', (event) => {
        const mapped = KEY_BINDINGS[event.code];
        if (!mapped) {
            return;
        }
        if (activeKeys.has(event.code)) {
            event.preventDefault();
            return;
        }
        activeKeys.add(event.code);
        event.preventDefault();
        updateButtonPress(mapped, `key-${event.code}`, true);
    });

    window.addEventListener('keyup', (event) => {
        if (event.key === 'Escape') {
            closeSheetIfNeeded();
        }
        const mapped = KEY_BINDINGS[event.code];
        if (!mapped) {
            return;
        }
        activeKeys.delete(event.code);
        event.preventDefault();
        updateButtonPress(mapped, `key-${event.code}`, false);
    });

    connectButton?.addEventListener('click', handleConnect);
    disconnectButton?.addEventListener('click', handleDisconnect);
    writeWithResponseCheckbox?.addEventListener('change', () => {
        connection.writeWithResponse = !!writeWithResponseCheckbox.checked;
        appendLog(`書き込みモード: ${connection.writeWithResponse ? 'writeValue (with response)' : 'writeValueWithoutResponse'}`);
    });

    window.addEventListener('blur', releaseAllInputs);

    if (!('bluetooth' in navigator)) {
        appendLog('このブラウザはWeb Bluetooth APIに対応していません。対応ブラウザでアクセスしてください。', true);
        setStatus('unsupported', '未対応');
        connectButton.disabled = true;
    }

    function updateButtonPress(name, sourceId, pressed) {
        const sources = buttonSources.get(name);
        if (!sources) {
            return;
        }
        const wasPressed = sources.size > 0;
        if (pressed) {
            sources.add(sourceId);
        } else {
            sources.delete(sourceId);
        }
        const isPressed = sources.size > 0;
        updateButtonVisual(name, isPressed);
        if (isPressed !== wasPressed) {
            setBitForButton(name, isPressed);
        }
    }

    function updateButtonVisual(name, pressed) {
        const element = buttonElements.get(name);
        if (!element) {
            return;
        }
        element.classList.toggle('is-pressed', pressed);
    }

    function setBitForButton(name, pressed) {
        const bit = BUTTON_BITS[name];
        if (typeof bit === 'undefined') {
            return;
        }
        const mask = 1 << bit;
        const nextState = pressed ? bitState | mask : bitState & ~mask;
        if (nextState === bitState) {
            return;
        }
        bitState = nextState;
        stateDirty = true;
        sendState();
    }

    async function sendState(force = false) {
        if (!connection.characteristic) {
            return;
        }
        if (writePending) {
            needsWrite = true;
            return;
        }
        if (!stateDirty && !force) {
            return;
        }

        writePending = true;
        needsWrite = false;
        const snapshot = bitState;
        const payload = new Uint8Array(2);
        payload[0] = snapshot & 0xff;
        payload[1] = (snapshot >> 8) & 0xff;
        stateDirty = false;

        try {
            if (connection.writeWithResponse && connection.characteristic.writeValue) {
                await connection.characteristic.writeValue(payload);
            } else {
                await connection.characteristic.writeValueWithoutResponse(payload);
            }
            appendLog(`送信: 0x${snapshot.toString(16).padStart(4, '0')}`);
        } catch (error) {
            appendLog(`送信に失敗しました: ${error.message}`, true);
        } finally {
            writePending = false;
            if (stateDirty || needsWrite || bitState !== snapshot) {
                needsWrite = false;
                sendState();
            }
        }
    }

    async function handleConnect() {
        if (!navigator.bluetooth) {
            return;
        }
        const serviceUuid = serviceInput.value.trim();
        const characteristicUuid = characteristicInput.value.trim();
        if (!serviceUuid || !characteristicUuid) {
            appendLog('サービスUUIDとキャラクタリスティックUUIDを入力してください。', true);
            return;
        }

        try {
            connectButton.disabled = true;
            disconnectButton.disabled = true;
            setStatus('connecting', '接続中…');
            appendLog('デバイスの選択ダイアログを開きます。');

            const serviceId = normalizeUuid(serviceUuid);
            const characteristicId = normalizeUuid(characteristicUuid);

            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [serviceId] }],
                optionalServices: [serviceId]
            });

            connection.device = device;
            device.addEventListener('gattserverdisconnected', handleGattDisconnected);
            appendLog(`「${device.name || '不明なデバイス'}」に接続しています…`);

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(serviceId);
            const characteristic = await service.getCharacteristic(characteristicId);

            connection.server = server;
            connection.characteristic = characteristic;
            connection.writeWithResponse = !!writeWithResponseCheckbox.checked;

            setStatus('connected', '接続済み');
            updateConnectedUi(true);
            appendLog('接続しました。');
            closeSheetIfNeeded();

            resetButtons();
            bitState = 0;
            stateDirty = true;
            await sendState(true);
        } catch (error) {
            const cancelled = error && (error.name === 'NotFoundError' || error.code === 8);
            if (cancelled) {
                appendLog('デバイスの選択がキャンセルされました。');
            } else {
                appendLog(`接続に失敗しました: ${error.message}`, true);
            }
            cleanupConnection();
        } finally {
            if (!connection.characteristic) {
                setStatus('idle', '未接続');
                updateConnectedUi(false);
            }
            connectButton.disabled = !!connection.characteristic;
            disconnectButton.disabled = !connection.characteristic;
        }
    }

    async function handleDisconnect() {
        if (!connection.device) {
            return;
        }
        appendLog('切断します。');
        try {
            if (connection.device.gatt.connected) {
                connection.device.gatt.disconnect();
            }
        } catch (error) {
            appendLog(`切断処理でエラー: ${error.message}`, true);
        } finally {
            cleanupConnection();
            setStatus('idle', '未接続');
            updateConnectedUi(false);
        }
    }

    function handleGattDisconnected() {
        appendLog('デバイスとの接続が切断されました。');
        cleanupConnection();
        setStatus('idle', '未接続');
        updateConnectedUi(false);
    }

    function updateConnectedUi(isConnected) {
        connectButton.disabled = isConnected;
        disconnectButton.disabled = !isConnected;
        lightBar?.classList.toggle('is-active', isConnected);
    }

    function cleanupConnection() {
        if (connection.device) {
            connection.device.removeEventListener('gattserverdisconnected', handleGattDisconnected);
        }
        connection.device = null;
        connection.server = null;
        connection.characteristic = null;
        connection.writeWithResponse = false;
        writePending = false;
        needsWrite = false;
        stateDirty = false;
        bitState = 0;
        resetButtons();
    }

    function resetButtons() {
        activeKeys.clear();
        buttonSources.forEach((set) => set.clear());
        buttonElements.forEach((element) => element.classList.remove('is-pressed'));
    }

    function setStatus(state, label) {
        connectionStatus.textContent = label;
        connectionStatus.classList.remove('is-connected', 'is-connecting');
        if (state === 'connected') {
            connectionStatus.classList.add('is-connected');
        } else if (state === 'connecting') {
            connectionStatus.classList.add('is-connecting');
        }
    }

    function appendLog(message, isError = false) {
        if (!logContent) {
            return;
        }
        const entry = document.createElement('p');
        const timestamp = new Date().toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        entry.textContent = `[${timestamp}] ${message}`;
        if (isError) {
            entry.classList.add('error');
        }
        logContent.appendChild(entry);
        while (logContent.children.length > 14) {
            logContent.removeChild(logContent.firstChild);
        }
        logContent.scrollTop = logContent.scrollHeight;
    }

    function releaseAllInputs() {
        let changed = false;
        buttonSources.forEach((sources, name) => {
            if (sources.size > 0) {
                sources.clear();
                updateButtonVisual(name, false);
                const bit = BUTTON_BITS[name];
                if (typeof bit !== 'undefined') {
                    const mask = 1 << bit;
                    if (bitState & mask) {
                        bitState &= ~mask;
                        changed = true;
                    }
                }
            }
        });
        activeKeys.clear();
        if (changed) {
            if (connection.characteristic) {
                stateDirty = true;
                sendState();
            } else {
                stateDirty = false;
            }
        }
    }

    function normalizeUuid(value) {
        if (typeof value !== 'string') {
            return value;
        }
        const trimmed = value.trim();
        if (/^0x[0-9a-f]{1,8}$/i.test(trimmed)) {
            return parseInt(trimmed, 16);
        }
        if (/^[0-9a-f]{4}$/i.test(trimmed)) {
            return parseInt(trimmed, 16);
        }
        return trimmed;
    }

    function isSheetMode() {
        return mobileSheetMediaQuery?.matches ?? false;
    }

    function setSheetOpen(open) {
        if (!controlPanel || !isSheetMode()) {
            return;
        }
        controlPanel.classList.toggle('is-open', open);
        controlPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (mobileSettingsToggle) {
            mobileSettingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            mobileSettingsToggle.classList.toggle('is-open', open);
        }
        if (settingsBackdrop) {
            settingsBackdrop.classList.toggle('is-visible', open);
        }
        document.body.classList.toggle('is-sheet-open', open);
        if (open) {
            const focusTarget = controlPanel.querySelector(
                'input, button, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            focusTarget?.focus({ preventScroll: true });
        }
    }

    function closeSheetIfNeeded() {
        if (!controlPanel || !controlPanel.classList.contains('is-open')) {
            return;
        }
        setSheetOpen(false);
    }

    function syncSheetMode() {
        if (!controlPanel) {
            return;
        }
        if (!isSheetMode()) {
            controlPanel.classList.remove('is-open');
            controlPanel.removeAttribute('aria-hidden');
            document.body.classList.remove('is-sheet-open');
            if (mobileSettingsToggle) {
                mobileSettingsToggle.setAttribute('aria-expanded', 'false');
                mobileSettingsToggle.classList.remove('is-open');
            }
            settingsBackdrop?.classList.remove('is-visible');
            return;
        }
        if (controlPanel.classList.contains('is-open')) {
            controlPanel.setAttribute('aria-hidden', 'false');
            document.body.classList.add('is-sheet-open');
            mobileSettingsToggle?.classList.add('is-open');
            mobileSettingsToggle?.setAttribute('aria-expanded', 'true');
            settingsBackdrop?.classList.add('is-visible');
        } else {
            controlPanel.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('is-sheet-open');
            mobileSettingsToggle?.classList.remove('is-open');
            mobileSettingsToggle?.setAttribute('aria-expanded', 'false');
            settingsBackdrop?.classList.remove('is-visible');
        }
    }
})();
