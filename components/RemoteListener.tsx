import React, { useEffect, useRef } from 'react';
import { useDataStore } from '../store/useDataStore';

const KEY_MAP: Record<string, { key: string; keyCode: number }> = {
    nav_up: { key: 'ArrowUp', keyCode: 38 },
    nav_down: { key: 'ArrowDown', keyCode: 40 },
    nav_left: { key: 'ArrowLeft', keyCode: 37 },
    nav_right: { key: 'ArrowRight', keyCode: 39 },
    nav_ok: { key: 'Enter', keyCode: 13 },
    nav_ok_down: { key: 'Enter', keyCode: 13 },
    nav_ok_up: { key: 'Enter', keyCode: 13 },
    nav_back: { key: 'Escape', keyCode: 27 },
    nav_delete: { key: 'Delete', keyCode: 46 },
};

const DEBOUNCE_MS = 150;
const WS_PORT = 3008;
const WS_RECONNECT = 5000;
const PEER_PREFIX = 'PLATINUM-TV';

function dispatchKey(action: string, lastActionTime: React.MutableRefObject<number>, instanceId: string) {
    const mapping = KEY_MAP[action];
    if (!mapping) {
        console.warn(`[REMOTE][${instanceId}] ❓ Action inconnue: ${action}`);
        return;
    }

    const now = Date.now();
    const delta = now - lastActionTime.current;
    
    // On ne debounce pas les commandes explicites Down/Up pour la réactivité
    const isExplicit = action.endsWith('_down') || action.endsWith('_up');

    if (!isExplicit && delta < DEBOUNCE_MS) {
        console.log(`[REMOTE][${instanceId}] 🚫 Debounce bloqué (delta: ${delta}ms)`);
        return;
    }
    
    if (!isExplicit) {
        lastActionTime.current = now;
    }

    const { key, keyCode } = mapping;
    
    const trigger = (type: 'keydown' | 'keyup') => {
        console.log(`[REMOTE][${instanceId}] 🕹️  Trigger ${type} for ${key} (Targeting activeElement)`);
        
        const ev = new KeyboardEvent(type, {
            key,
            code: key,
            keyCode,
            which: keyCode,
            bubbles: true, // IMPORTANT: permet à l'événement de remonter jusqu'à window
            cancelable: true,
            view: window
        });

        // Forçage des propriétés legacy
        Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
        Object.defineProperty(ev, 'which', { get: () => keyCode });

        // On cible l'élément actif s'il existe, sinon window.
        let target = (document.activeElement && document.activeElement !== document.body) 
            ? document.activeElement 
            : window;

        // Si on navigue (flèches) alors qu'un champ texte est actif, on le quitte
        // pour que la navigation spatiale prenne le relais (puisqu'on écrit sur le tél)
        if (['nav_up', 'nav_down', 'nav_left', 'nav_right'].includes(action)) {
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                target.blur();
                target = window; // Fallback pour que l'événement soit bien intercepté globalement
            }
        }
            
        target.dispatchEvent(ev);
    };

    if (action.endsWith('_ok_down')) {
        trigger('keydown');
    } else if (action.endsWith('_ok_up')) {
        trigger('keyup');
    } else {
        trigger('keydown');
        setTimeout(() => trigger('keyup'), 50);
    }
}

function createWebSocket(
    host: string,
    lastActionTime: React.MutableRefObject<number>,
    instanceId: string,
    onClose: () => void
): WebSocket {
    console.log(`[REMOTE][${instanceId}] 🔌 Création WebSocket → ws://${host}:${WS_PORT}`);
    const ws = new WebSocket(`ws://${host}:${WS_PORT}`);
    ws.onopen = () => console.log(`[REMOTE][${instanceId}] ✅ WS connecté: ${host}`);
    ws.onerror = (e) => console.error(`[REMOTE][${instanceId}] ❌ WS erreur:`, e);
    ws.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            console.log(`[REMOTE][${instanceId}] 📨 WS message reçu:`, data);
            if (data.type === 'nav') dispatchKey(data.action, lastActionTime, instanceId);
            else if (data.type === 'input') {
                const el = document.activeElement as HTMLInputElement;
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                    if (nativeInputValueSetter) {
                        nativeInputValueSetter.call(el, data.value);
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        } catch {
            console.warn(`[REMOTE][${instanceId}] ⚠️ Message WS invalide:`, e.data);
        }
    };
    ws.onclose = () => {
        console.warn(`[REMOTE][${instanceId}] 🔴 WS fermé, reconnexion dans ${WS_RECONNECT}ms`);
        onClose();
    };
    return ws;
}

export const RemoteListener: React.FC = () => {
    const { remoteHubIp } = useDataStore();
    const lastActionTime = useRef<number>(0);
    const instanceId = useRef<string>(`INST-${Math.random().toString(36).substring(2, 5).toUpperCase()}`);

    // Log montage/démontage
    useEffect(() => {
        console.log(`[REMOTE][${instanceId.current}] ⚡ MOUNT (total mounts visibles dans la console = nb d'instances)`);
        return () => console.log(`[REMOTE][${instanceId.current}] 💀 UNMOUNT`);
    }, []);

    useEffect(() => {
        const id = instanceId.current;
        let destroyed = false;
        let ws: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let peer: any = null;
        let peerCheckTimer: ReturnType<typeof setInterval> | null = null;

        const host = remoteHubIp || (
            typeof window !== 'undefined' && (window as any).electronAPI ? 'localhost' : null
        );

        console.log(`[REMOTE][${id}] 🚀 useEffect lancé — host: ${host ?? 'aucun (mode PeerJS)'}`);

        // ── MODE 1 : WebSocket ──
        if (host) {
            console.log(`[REMOTE][${id}] 📡 Mode: WebSocket`);
            const connect = () => {
                if (destroyed) {
                    console.log(`[REMOTE][${id}] 🛑 connect() annulée (destroyed)`);
                    return;
                }
                ws = createWebSocket(host, lastActionTime, id, () => {
                    if (!destroyed) reconnectTimer = setTimeout(connect, WS_RECONNECT);
                });
            };
            connect();

            const handleFocusIn = (e: FocusEvent) => {
                const target = e.target as HTMLElement;
                if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                    if (ws?.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ action: 'input_focus', isFocused: true, value: (target as HTMLInputElement).value }));
                    }
                }
            };
            const handleFocusOut = (e: FocusEvent) => {
                const target = e.target as HTMLElement;
                if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                    if (ws?.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ action: 'input_focus', isFocused: false, value: '' }));
                    }
                }
            };

            window.addEventListener('focusin', handleFocusIn);
            window.addEventListener('focusout', handleFocusOut);

            return () => {
                console.log(`[REMOTE][${id}] 🧹 Cleanup WebSocket`);
                destroyed = true;
                window.removeEventListener('focusin', handleFocusIn);
                window.removeEventListener('focusout', handleFocusOut);
                if (reconnectTimer) clearTimeout(reconnectTimer);
                ws?.close();
            };
        }

        // ── MODE 2 : PeerJS ──
        console.log(`[REMOTE][${id}] 📡 Mode: PeerJS`);
        const initPeer = (): boolean => {
            if (destroyed) {
                console.log(`[REMOTE][${id}] 🛑 initPeer() annulée (destroyed)`);
                return false;
            }
            if (typeof window === 'undefined' || !(window as any).Peer) {
                console.log(`[REMOTE][${id}] ⏳ Peer pas encore disponible dans window`);
                return false;
            }

            const peerId = `${PEER_PREFIX}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
            console.log(`[REMOTE][${id}] 🆔 Création PeerJS avec ID: ${peerId}`);
            // @ts-ignore
            peer = new window.Peer(peerId);
            (window as any).currentPeerId = peerId;

            let activeConn: any = null;

            peer.on('open', (openId: string) => console.log(`[REMOTE][${id}] ✅ PeerJS ouvert. ID: ${openId}`));
            peer.on('connection', (conn: any) => {
                activeConn = conn;
                console.log(`[REMOTE][${id}] 📱 P2P: téléphone connecté`);
                conn.on('data', (data: any) => {
                    console.log(`[REMOTE][${id}] 📨 P2P message reçu:`, data);
                    try {
                        if (data.type === 'nav') dispatchKey(data.action, lastActionTime, id);
                        else if (data.type === 'input') {
                            const el = document.activeElement as HTMLInputElement;
                            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                                if (nativeInputValueSetter) {
                                    nativeInputValueSetter.call(el, data.value);
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            }
                        }
                    } catch {
                        console.warn(`[REMOTE][${id}] ⚠️ Data P2P invalide`);
                    }
                });
                conn.on('close', () => {
                    activeConn = null;
                    console.warn(`[REMOTE][${id}] 🔴 Connexion P2P fermée`);
                });
            });
            peer.on('error', (err: any) => console.error(`[REMOTE][${id}] ❌ PeerJS erreur:`, err));

            const handleFocusIn = (e: FocusEvent) => {
                const target = e.target as HTMLElement;
                if (activeConn && target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                    activeConn.send({ action: 'input_focus', isFocused: true, value: (target as HTMLInputElement).value });
                }
            };
            const handleFocusOut = (e: FocusEvent) => {
                const target = e.target as HTMLElement;
                if (activeConn && target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                    activeConn.send({ action: 'input_focus', isFocused: false, value: '' });
                }
            };

            window.addEventListener('focusin', handleFocusIn);
            window.addEventListener('focusout', handleFocusOut);
            
            // Hack to attach cleanup
            peer._cleanupListeners = () => {
                window.removeEventListener('focusin', handleFocusIn);
                window.removeEventListener('focusout', handleFocusOut);
            };

            return true;
        };

        if (!initPeer()) {
            console.log(`[REMOTE][${id}] 🔄 PeerJS pas prêt, polling toutes les secondes...`);
            peerCheckTimer = setInterval(() => {
                if (initPeer()) {
                    clearInterval(peerCheckTimer!);
                    peerCheckTimer = null;
                }
            }, 1000);
        }

        return () => {
            console.log(`[REMOTE][${id}] 🧹 Cleanup PeerJS`);
            destroyed = true;
            if (peerCheckTimer) clearInterval(peerCheckTimer);
            if (peer && peer._cleanupListeners) peer._cleanupListeners();
            peer?.destroy();
        };

    }, [remoteHubIp]);

    return null;
};