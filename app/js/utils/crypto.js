/**
 * Viz Magic — AES Encryption for Sealed Sigils
 * Uses Web Crypto API for commit-reveal PvP mechanics.
 */
var CryptoUtil = (function() {
    'use strict';

    /**
     * Generate a random encryption key (for Sealed Sigils)
     * @returns {Promise<string>} hex-encoded key
     */
    async function generateKey() {
        var key = await crypto.subtle.generateKey(
            { name: 'AES-CBC', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        var raw = await crypto.subtle.exportKey('raw', key);
        return _arrayBufferToHex(raw);
    }

    /**
     * Encrypt data with AES-256-CBC
     * @param {string} plaintext
     * @param {string} keyHex - hex-encoded 256-bit key
     * @returns {Promise<string>} hex-encoded iv+ciphertext
     */
    async function encrypt(plaintext, keyHex) {
        var keyBuffer = _hexToArrayBuffer(keyHex);
        var key = await crypto.subtle.importKey(
            'raw', keyBuffer, { name: 'AES-CBC' }, false, ['encrypt']
        );
        var iv = crypto.getRandomValues(new Uint8Array(16));
        var encoded = new TextEncoder().encode(plaintext);
        var ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-CBC', iv: iv }, key, encoded
        );
        // Prepend IV to ciphertext
        var result = new Uint8Array(iv.length + ciphertext.byteLength);
        result.set(iv);
        result.set(new Uint8Array(ciphertext), iv.length);
        return _arrayBufferToHex(result.buffer);
    }

    /**
     * Decrypt data with AES-256-CBC
     * @param {string} ciphertextHex - hex-encoded iv+ciphertext
     * @param {string} keyHex - hex-encoded key
     * @returns {Promise<string>} decrypted plaintext
     */
    async function decrypt(ciphertextHex, keyHex) {
        var data = _hexToArrayBuffer(ciphertextHex);
        var dataArray = new Uint8Array(data);
        var iv = dataArray.slice(0, 16);
        var ciphertext = dataArray.slice(16);
        var keyBuffer = _hexToArrayBuffer(keyHex);
        var key = await crypto.subtle.importKey(
            'raw', keyBuffer, { name: 'AES-CBC' }, false, ['decrypt']
        );
        var decrypted = await crypto.subtle.decrypt(
            { name: 'AES-CBC', iv: iv }, key, ciphertext
        );
        return new TextDecoder().decode(decrypted);
    }

    /**
     * Generate a passphrase-based key (for simple encryption)
     * @param {string} passphrase
     * @returns {Promise<string>} hex key
     */
    async function keyFromPassphrase(passphrase) {
        var encoded = new TextEncoder().encode(passphrase);
        var hash = await crypto.subtle.digest('SHA-256', encoded);
        return _arrayBufferToHex(hash);
    }

    /** Convert ArrayBuffer to hex string */
    function _arrayBufferToHex(buffer) {
        var arr = new Uint8Array(buffer);
        var hex = '';
        for (var i = 0; i < arr.length; i++) {
            hex += arr[i].toString(16).padStart(2, '0');
        }
        return hex;
    }

    /** Convert hex string to ArrayBuffer */
    function _hexToArrayBuffer(hex) {
        var bytes = new Uint8Array(hex.length / 2);
        for (var i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        return bytes.buffer;
    }

    return {
        generateKey: generateKey,
        encrypt: encrypt,
        decrypt: decrypt,
        keyFromPassphrase: keyFromPassphrase
    };
})();
