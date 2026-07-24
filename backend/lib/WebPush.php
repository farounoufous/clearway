<?php
// ============================================
// ClearWay Bénin - Librairie Web Push
// Implémente RFC 8291 (chiffrement aes128gcm) + RFC 8292 (VAPID)
// Sans dépendance externe (Composer/Packagist non nécessaire)
// ============================================

class WebPush
{
    private string $vapidPublicKeyB64;
    private string $vapidPrivateKeyB64;
    private string $vapidSubject;

    public function __construct(string $vapidPublicKeyB64, string $vapidPrivateKeyB64, string $vapidSubject)
    {
        $this->vapidPublicKeyB64 = $vapidPublicKeyB64;
        $this->vapidPrivateKeyB64 = $vapidPrivateKeyB64;
        $this->vapidSubject = $vapidSubject;
    }

    // ---------- Utilitaires base64url ----------
    private static function b64urlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function b64urlDecode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
    }

    // ---------- HKDF (RFC 5869) ----------
    private static function hkdf(string $salt, string $ikm, string $info, int $length): string
    {
        $prk = hash_hmac('sha256', $ikm, $salt, true);
        $t = '';
        $okm = '';
        $i = 1;
        while (strlen($okm) < $length) {
            $t = hash_hmac('sha256', $t . $info . chr($i), $prk, true);
            $okm .= $t;
            $i++;
        }
        return substr($okm, 0, $length);
    }

    // ---------- Reconstruit une ressource clé publique EC depuis un point brut (65 octets) ----------
    private static function clePubliqueDepuisPointBrut(string $pointBrut)
    {
        $x = substr($pointBrut, 1, 32);
        $y = substr($pointBrut, 33, 32);
        $der = pack('H*', '3059301306072a8648ce3d020106082a8648ce3d030107034200') . "\x04" . $x . $y;
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64) . "-----END PUBLIC KEY-----\n";
        return openssl_pkey_get_public($pem);
    }

    // ---------- Génère une paire de clés EC P-256, retourne aussi le point public brut ----------
    private static function genererPaireCles(): array
    {
        $res = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        $details = openssl_pkey_get_details($res);
        $pubRaw = "\x04" . $details['ec']['x'] . $details['ec']['y'];
        return ['priv' => $res, 'pub_raw' => $pubRaw];
    }

    // ---------- Convertit une signature ECDSA DER en format brut r||s (64 octets, requis par JWS) ----------
    private static function derVersSignatureBrute(string $der): string
    {
        $offset = 3;
        $lenR = ord($der[$offset]);
        $offset++;
        $r = substr($der, $offset, $lenR);
        $offset += $lenR + 1;
        $lenS = ord($der[$offset]);
        $offset++;
        $s = substr($der, $offset, $lenS);

        $r = str_pad(ltrim($r, "\x00"), 32, "\x00", STR_PAD_LEFT);
        $s = str_pad(ltrim($s, "\x00"), 32, "\x00", STR_PAD_LEFT);

        return $r . $s;
    }

    // ---------- Génère le JWT VAPID (Authorization) pour un endpoint donné ----------
    private function genererJwtVapid(string $audience): string
    {
        $privatePem = "-----BEGIN EC PRIVATE KEY-----\n"; // reconstruit depuis la clé stockée
        $privateKeyRes = $this->clePriveeDepuisB64($this->vapidPrivateKeyB64, $this->vapidPublicKeyB64);

        $header = self::b64urlEncode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $payload = self::b64urlEncode(json_encode([
            'aud' => $audience,
            'exp' => time() + 12 * 3600,
            'sub' => $this->vapidSubject,
        ]));
        $signingInput = $header . '.' . $payload;

        openssl_sign($signingInput, $signatureDer, $privateKeyRes, OPENSSL_ALGO_SHA256);
        $signatureRaw = self::derVersSignatureBrute($signatureDer);

        return $signingInput . '.' . self::b64urlEncode($signatureRaw);
    }

    // ---------- Reconstruit une ressource clé privée EC depuis les octets bruts stockés (d, x, y) ----------
    private function clePriveeDepuisB64(string $privB64, string $pubB64)
    {
        $d = self::b64urlDecode($privB64);
        $pubRaw = self::b64urlDecode($pubB64);
        $x = substr($pubRaw, 1, 32);
        $y = substr($pubRaw, 33, 32);

        // Construction ASN.1 d'une clé privée EC (SEC1) complète, pour qu'OpenSSL puisse signer
        $derPriv =
            "\x30\x77" .                                   // SEQUENCE
            "\x02\x01\x01" .                               // INTEGER version = 1
            "\x04\x20" . $d .                              // OCTET STRING private key (32 octets)
            "\xa0\x0a\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07" . // [0] curve OID prime256v1
            "\xa1\x44\x03\x42\x00\x04" . $x . $y;          // [1] BIT STRING public key

        $pem = "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($derPriv), 64) . "-----END EC PRIVATE KEY-----\n";
        return openssl_pkey_get_private($pem);
    }

    /**
     * Envoie une notification push chiffrée à un abonné.
     *
     * @param array $subscription ['endpoint' => ..., 'p256dh' => ..., 'auth' => ...] (base64url, tel que fourni par le navigateur)
     * @param string $payloadJson Le contenu JSON à afficher (titre, message, etc.)
     * @return array ['succes' => bool, 'code_http' => int, 'expire' => bool]
     */
    public function envoyerNotification(array $subscription, string $payloadJson): array
    {
        $uaPubRaw = self::b64urlDecode($subscription['p256dh']);
        $authSecret = self::b64urlDecode($subscription['auth']);

        $serverKeys = self::genererPaireCles();
        $uaPubRes = self::clePubliqueDepuisPointBrut($uaPubRaw);
        $ecdhSecret = openssl_pkey_derive($uaPubRes, $serverKeys['priv']);

        $info = "WebPush: info\x00" . $uaPubRaw . $serverKeys['pub_raw'];
        $ikm = self::hkdf($authSecret, $ecdhSecret, $info, 32);

        $salt = random_bytes(16);
        $cek = self::hkdf($salt, $ikm, "Content-Encoding: aes128gcm\x00", 16);
        $nonce = self::hkdf($salt, $ikm, "Content-Encoding: nonce\x00", 12);

        $paddedPlaintext = $payloadJson . "\x02";
        $tag = '';
        $ciphertext = openssl_encrypt($paddedPlaintext, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
        $ciphertextComplet = $ciphertext . $tag;

        $header = $salt . pack('N', strlen($ciphertextComplet)) . chr(strlen($serverKeys['pub_raw'])) . $serverKeys['pub_raw'];
        $corps = $header . $ciphertextComplet;

        $audience = parse_url($subscription['endpoint'], PHP_URL_SCHEME) . '://' . parse_url($subscription['endpoint'], PHP_URL_HOST);
        $jwt = $this->genererJwtVapid($audience);

        $ch = curl_init($subscription['endpoint']);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $corps,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/octet-stream',
                'Content-Encoding: aes128gcm',
                'TTL: 86400',
                'Authorization: vapid t=' . $jwt . ', k=' . $this->vapidPublicKeyB64,
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
        ]);
        curl_exec($ch);
        $codeHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return [
            'succes' => $codeHttp >= 200 && $codeHttp < 300,
            'code_http' => $codeHttp,
            // 404/410 = l'abonnement n'existe plus côté navigateur -> à supprimer de la base
            'expire' => in_array($codeHttp, [404, 410], true),
        ];
    }

    /**
     * Génère une nouvelle paire de clés VAPID (à exécuter UNE SEULE FOIS, via generer-cles-vapid.php)
     */
    public static function genererClesVapid(): array
    {
        $paire = self::genererPaireCles();
        $details = openssl_pkey_get_details($paire['priv']);
        $privRaw = $details['ec']['d'];

        return [
            'public' => self::b64urlEncode($paire['pub_raw']),
            'private' => self::b64urlEncode($privRaw),
        ];
    }
}
