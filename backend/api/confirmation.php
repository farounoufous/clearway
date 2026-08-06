<?php
header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

// Si c'est une requête de pré-vérification (OPTIONS), on arrête le script immédiatement
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

$origineBackend = (($_SERVER['HTTPS'] ?? 'off') !== 'off' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];

header('Content-Type: application/json; charset=utf-8');
require_once dirname(__DIR__) . '/config/db.php';

const SEUIL_CONFIRMATIONS_DEGAGEE = 3;
const SEUIL_CONFIRMATIONS_VALIDATION = 3;
const SEUIL_SIGNALEMENT_ERRONE = 2;

function graviteClasse($gravite) {
    return match ($gravite) {
        'Severe' => 'severe',
        'Modere' => 'modere',
        default => 'praticable',
    };
}

function graviteLabel($gravite) {
    return match ($gravite) {
        'Severe' => 'sévère',
        'Modere' => 'modéré',
        'Praticable' => 'Praticable',
        default => 'léger',
    };
}
function confiance($statut, $valide, $nbConfirmations) {
    if ($valide) return 'validee';
    if ($nbConfirmations > 0) return 'confirmee_partiellement';
    if ($statut === 'incertain') return 'incertain';
    return 'recente';
}

function libelleZone($s) {
    if (!empty($s['quartier'])) return $s['quartier'];
    if (!empty($s['ville'])) return $s['ville'];
    if (!empty($s['pays'])) return $s['pays'];
    if ($s['latitude'] !== null && $s['longitude'] !== null) {
        return 'Position (' . round((float) $s['latitude'], 4) . ', ' . round((float) $s['longitude'], 4) . ')';
    }
    return 'Localisation inconnue';
}

function tempsRestant($base) {
    $deadline = strtotime($base) + 3 * 3600;
    $secondesRestantes = $deadline - time();
    if ($secondesRestantes <= 0) return '0h00';
    $h = floor($secondesRestantes / 3600);
    $m = floor(($secondesRestantes % 3600) / 60);
    return $h . 'h' . str_pad($m, 2, '0', STR_PAD_LEFT);
}

function compterConfirmationsDegageeDistinctes(PDO $pdo, int $signalementId): int {
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) AS total
        FROM confirmations
        WHERE signalement_id = ? AND type_confirmation = 'voie_degagee'
    ");
    $stmt->execute([$signalementId]);
    return (int) $stmt->fetch()['total'];
}

function compterConfirmationsBloqueesDistinctes(PDO $pdo, int $signalementId): int {
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) AS total
        FROM confirmations
        WHERE signalement_id = ? AND type_confirmation = 'toujours_bloquee'
    ");
    $stmt->execute([$signalementId]);
    return (int) $stmt->fetch()['total'];
}

function compterConfirmationsErroneesDistinctes(PDO $pdo, int $signalementId): int {
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) AS total
        FROM confirmations
        WHERE signalement_id = ? AND type_confirmation = 'signalement_errone'
    ");
    $stmt->execute([$signalementId]);
    return (int) $stmt->fetch()['total'];
}
function marquerValideSiSeuilAtteint(PDO $pdo, int $signalementId): bool {
    $nbBloquees = compterConfirmationsBloqueesDistinctes($pdo, $signalementId);
    if ($nbBloquees >= SEUIL_CONFIRMATIONS_VALIDATION) {
        $pdo->prepare("UPDATE signalements SET valide = 1 WHERE id = ? AND valide = 0")
            ->execute([$signalementId]);
        return true;
    }
    return false;
}

$methode = $_SERVER['REQUEST_METHOD'];
if ($methode === 'GET') {
    $id = $_GET['id'] ?? null;

    if (empty($id) || !is_numeric($id)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Identifiant de signalement invalide.']);
        exit;
    }

    $stmt = $pdo->prepare("
        SELECT s.id, s.gravite, s.date_creation, s.derniere_confirmation, s.statut, s.valide, s.photo,
               s.latitude, s.longitude, s.pays, s.ville, s.quartier, s.adresse_formatee
        FROM signalements s
        WHERE s.id = ?
    ");
    $stmt->execute([$id]);
    $s = $stmt->fetch();

    if (!$s) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Signalement introuvable.']);
        exit;
    }

    $base = $s['derniere_confirmation'] ?? $s['date_creation'];
    $estValide = (bool) $s['valide'];
    $nbBloquees = compterConfirmationsBloqueesDistinctes($pdo, (int) $s['id']);
    $nbDegagees = compterConfirmationsDegageeDistinctes($pdo, (int) $s['id']);
    $nbErrones = compterConfirmationsErroneesDistinctes($pdo, (int) $s['id']);
    $progression = min(100, (int) round($nbDegagees / SEUIL_CONFIRMATIONS_DEGAGEE * 100));

    echo json_encode([
        'id' => (int) $s['id'],
        'zone' => libelleZone($s),
        'adresse_complete' => $s['adresse_formatee'],
        'gravite_classe' => graviteClasse($s['gravite']),
        'gravite_label' => graviteLabel($s['gravite']),
        'statut' => $s['statut'],
        'valide' => $estValide,
        'confiance' => confiance($s['statut'], $estValide, $nbBloquees),
        'nb_confirmations' => $nbBloquees,
        'seuil_validation' => SEUIL_CONFIRMATIONS_VALIDATION,
        'nb_degagees' => $nbDegagees,
        'seuil_degagees' => SEUIL_CONFIRMATIONS_DEGAGEE,
        'seuil_atteint' => $nbDegagees >= SEUIL_CONFIRMATIONS_DEGAGEE,
        'nb_errones' => $nbErrones,
        'seuil_errone' => SEUIL_SIGNALEMENT_ERRONE,
        'progression_degagee' => $progression,
        // Une fois validé, le signalement ne s'archive plus jamais tout seul :
        'temps_restant' => $estValide ? null : tempsRestant($base),
        'photo' => $s['photo'] ? $origineBackend . '/uploads/' . $s['photo'] : null,
        'lien_maps' => ($s['latitude'] !== null && $s['longitude'] !== null)
            ? "https://www.google.com/maps?q={$s['latitude']},{$s['longitude']}"
            : null,
    ]);
    exit;
}
if ($methode === 'POST') {
    $donnees = json_decode(file_get_contents('php://input'), true);

    $signalementId = $donnees['signalement_id'] ?? null;
    $action = $donnees['action'] ?? null;
    $visiteurId = trim($donnees['visiteur_id'] ?? '');

    if (empty($signalementId) || !is_numeric($signalementId)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Identifiant de signalement invalide.']);
        exit;
    }
    if (!in_array($action, ['toujours_bloquee', 'voie_degagee', 'confirmer_degagement', 'signalement_errone'], true)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Action invalide.']);
        exit;
    }
    if ($visiteurId === '') {
        http_response_code(400);
        echo json_encode(['erreur' => 'Identifiant visiteur manquant.']);
        exit;
    }

    // Vérifie que le signalement existe et est actif
    $stmtVerif = $pdo->prepare("SELECT id, statut FROM signalements WHERE id = ?");
    $stmtVerif->execute([$signalementId]);
    $signalement = $stmtVerif->fetch();

    if (!$signalement) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Signalement introuvable.']);
        exit;
    }
    if (!in_array($signalement['statut'], ['actif', 'incertain'], true)) {
        http_response_code(410);
        echo json_encode(['erreur' => 'Ce signalement a déjà été archivé.']);
        exit;
    }
    if ($action === 'confirmer_degagement') {
        $nbDegagees = compterConfirmationsDegageeDistinctes($pdo, (int) $signalementId);

        if ($nbDegagees < SEUIL_CONFIRMATIONS_DEGAGEE) {
            http_response_code(409);
            echo json_encode(['erreur' => 'Le seuil de confirmations n\'est pas encore atteint.']);
            exit;
        }

        $pdo->prepare("UPDATE signalements SET statut = 'archive', date_archivage = NOW() WHERE id = ?")
            ->execute([$signalementId]);

        $reponseJson = json_encode(['succes' => true, 'action' => $action, 'archive' => true]);

        ignore_user_abort(true);
        if (function_exists('fastcgi_finish_request')) {
            echo $reponseJson;
            fastcgi_finish_request();
        } else {
            header('Content-Length: ' . strlen($reponseJson));
            header('Connection: close');
            echo $reponseJson;
            if (ob_get_level() > 0) {
                ob_end_flush();
            }
            flush();
        }

        try {
            require_once __DIR__ . '/../lib/WebPush.php';
            require_once __DIR__ . '/../config/vapid.php';

            $stmtZoneNom = $pdo->prepare("SELECT quartier, ville, latitude, longitude FROM signalements WHERE id = ?");
            $stmtZoneNom->execute([$signalementId]);
            $ligneZone = $stmtZoneNom->fetch();
            $nomZone = ($ligneZone['quartier'] ?: $ligneZone['ville']) ?: 'Une voie';

            $payloadNotification = json_encode([
                'titre' => 'ClearWay Bénin',
                'message' => $nomZone . ' a été confirmée dégagée par la communauté — la voie est de nouveau praticable.',
            ]);

            $webpush = new WebPush(VAPID_CLE_PUBLIQUE, VAPID_CLE_PRIVEE, VAPID_SUBJECT);

            // Alertes push UNIQUEMENT dans un rayon de 5 km
            $abonnements = [];
            $latitudeVoie = $ligneZone['latitude'] !== null ? (float) $ligneZone['latitude'] : null;
            $longitudeVoie = $ligneZone['longitude'] !== null ? (float) $ligneZone['longitude'] : null;

            if ($latitudeVoie !== null && $longitudeVoie !== null) {
                $stmtAbonnements = $pdo->prepare("
                    SELECT id, endpoint, p256dh, auth_secret
                    FROM push_subscriptions
                    WHERE latitude IS NOT NULL
                      AND longitude IS NOT NULL
                      AND (
                          6371 * ACOS(
                              COS(RADIANS(:lat1)) * COS(RADIANS(latitude)) *
                              COS(RADIANS(longitude) - RADIANS(:lng1)) +
                              SIN(RADIANS(:lat2)) * SIN(RADIANS(latitude))
                          )
                      ) <= 5
                ");
                $stmtAbonnements->bindValue(':lat1', $latitudeVoie);
                $stmtAbonnements->bindValue(':lat2', $latitudeVoie);
                $stmtAbonnements->bindValue(':lng1', $longitudeVoie);
                $stmtAbonnements->execute();
                $abonnements = $stmtAbonnements->fetchAll();
            }

            foreach ($abonnements as $abonnement) {
                try {
                    $resultat = $webpush->envoyerNotification([
                        'endpoint' => $abonnement['endpoint'],
                        'p256dh' => $abonnement['p256dh'],
                        'auth' => $abonnement['auth_secret'],
                    ], $payloadNotification);

                    if ($resultat['expire']) {
                        $pdo->prepare("DELETE FROM push_subscriptions WHERE id = ?")->execute([$abonnement['id']]);
                    }
                } catch (\Throwable $e) {
                    error_log('Échec envoi notification voie dégagée ' . $signalementId . ' : ' . $e->getMessage());
                }
            }
        } catch (\Throwable $e) {
            error_log('Notifications indisponibles pour la voie dégagée ' . $signalementId . ' : ' . $e->getMessage());
        }
        exit;
    }

    $ip = $_SERVER['REMOTE_ADDR'] ?? 'inconnu';

    $stmtDejaVote = $pdo->prepare("
        SELECT id FROM confirmations WHERE signalement_id = ? AND visiteur_id = ? AND type_confirmation = ?
    ");
    $stmtDejaVote->execute([$signalementId, $visiteurId, $action]);
    $dejaVote = (bool) $stmtDejaVote->fetch();

    if (!$dejaVote) {
        $stmtInsert = $pdo->prepare("
            INSERT INTO confirmations (signalement_id, type_confirmation, ip_utilisateur, visiteur_id, date_confirmation)
            VALUES (?, ?, ?, ?, NOW())
        ");
        $stmtInsert->execute([$signalementId, $action, $ip, $visiteurId]);
    }

    if ($action === 'toujours_bloquee') {
        $pdo->prepare("
            UPDATE signalements
            SET derniere_confirmation = NOW(), statut = 'actif'
            WHERE id = ? AND statut IN ('actif', 'incertain')
        ")->execute([$signalementId]);

        $nbBloquees = compterConfirmationsBloqueesDistinctes($pdo, (int) $signalementId);
        marquerValideSiSeuilAtteint($pdo, (int) $signalementId);

        echo json_encode([
            'succes' => true,
            'action' => $action,
            'nb_confirmations' => $nbBloquees,
            'seuil_validation' => SEUIL_CONFIRMATIONS_VALIDATION,
            'valide' => $nbBloquees >= SEUIL_CONFIRMATIONS_VALIDATION,
        ]);
        exit;
    }
    if ($action === 'signalement_errone') {
        $nbErrones = compterConfirmationsErroneesDistinctes($pdo, (int) $signalementId);
        $archive = $nbErrones >= SEUIL_SIGNALEMENT_ERRONE;

        if ($archive) {
            $pdo->prepare("UPDATE signalements SET statut = 'archive', date_archivage = NOW() WHERE id = ?")
                ->execute([$signalementId]);
        }

        echo json_encode([
            'succes' => true,
            'action' => $action,
            'nb_errones' => $nbErrones,
            'seuil_errone' => SEUIL_SIGNALEMENT_ERRONE,
            'archive' => $archive,
        ]);
        exit;
    }
    $nbDegagees = compterConfirmationsDegageeDistinctes($pdo, (int) $signalementId);
    $progression = min(100, (int) round($nbDegagees / SEUIL_CONFIRMATIONS_DEGAGEE * 100));

    echo json_encode([
        'succes' => true,
        'action' => $action,
        'nb_degagees' => $nbDegagees,
        'seuil_degagees' => SEUIL_CONFIRMATIONS_DEGAGEE,
        'progression_degagee' => $progression,
        'seuil_atteint' => $nbDegagees >= SEUIL_CONFIRMATIONS_DEGAGEE,
        'archive' => false,
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['erreur' => 'Méthode non autorisée.']);