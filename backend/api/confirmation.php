<?php

header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app"); // ⚠️ REMPLACEZ par votre vraie URL Vercel
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

// Si c'est une requête de pré-vérification (OPTIONS), on arrête le script immédiatement
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}


// ============================================
// ClearWay Bénin - API Confirmation collaborative
// GET  ?id=X            -> détails du signalement (zone, gravité, confirmations, progression, temps restant, photo)
// POST {signalement_id, action, visiteur_id}
//
// Règle "voie dégagée" : il faut 3 confirmations de 3 VISITEURS DIFFÉRENTS
// (identifiant anonyme généré par le navigateur, pas l'IP) avant que le
// signalement soit archivé (retiré de la liste des voies bloquées).
// Le propriétaire du signalement PEUT voter "voie dégagée" (ça compte pour 1
// des 3), mais ne peut JAMAIS voter "toujours bloquée" sur son propre signalement.
// ============================================

header('Content-Type: application/json; charset=utf-8');
require_once dirname(__DIR__) . '/config/db.php';

const SEUIL_CONFIRMATIONS_DEGAGEE = 3;
const SEUIL_CONFIRMATIONS_VALIDATION = 3;

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

// Libellé de secours : quartier > ville > pays > coordonnées brutes
function libelleZone($s) {
    if (!empty($s['quartier'])) return $s['quartier'];
    if (!empty($s['ville'])) return $s['ville'];
    if (!empty($s['pays'])) return $s['pays'];
    if ($s['latitude'] !== null && $s['longitude'] !== null) {
        return 'Position (' . round((float) $s['latitude'], 4) . ', ' . round((float) $s['longitude'], 4) . ')';
    }
    return 'Localisation inconnue';
}

// Calcule le temps restant avant archivage auto (format "1h48")
function tempsRestant($base) {
    $deadline = strtotime($base) + 3 * 3600;
    $secondesRestantes = $deadline - time();
    if ($secondesRestantes <= 0) return '0h00';
    $h = floor($secondesRestantes / 3600);
    $m = floor(($secondesRestantes % 3600) / 60);
    return $h . 'h' . str_pad($m, 2, '0', STR_PAD_LEFT);
}

// Compte les confirmations "voie dégagée" par VISITEUR distinct
// (repli sur l'IP pour la compatibilité avec d'anciennes lignes créées avant cette migration)
function compterConfirmationsDegageeDistinctes(PDO $pdo, int $signalementId): int {
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) AS total
        FROM confirmations
        WHERE signalement_id = ? AND type_confirmation = 'voie_degagee'
    ");
    $stmt->execute([$signalementId]);
    return (int) $stmt->fetch()['total'];
}

// Compte les confirmations "toujours bloquée" par VISITEUR distinct
// (même logique que ci-dessus : un même visiteur ne doit compter qu'une fois,
// même s'il existe d'anciennes lignes sans visiteur_id créées avant migration)
function compterConfirmationsBloqueesDistinctes(PDO $pdo, int $signalementId): int {
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) AS total
        FROM confirmations
        WHERE signalement_id = ? AND type_confirmation = 'toujours_bloquee'
    ");
    $stmt->execute([$signalementId]);
    return (int) $stmt->fetch()['total'];
}

// Marque le signalement comme "validé" par la communauté dès que le seuil de
// confirmations "toujours bloquée" distinctes est atteint. Un signalement
// validé n'est plus jamais archivé automatiquement après 3h (voir voies.php) :
// il ne disparaîtra que via le circuit "voie dégagée" + confirmer_degagement.
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

// ================================================
// GET : détails d'un signalement
// ================================================
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
    $progression = min(100, (int) round($nbDegagees / SEUIL_CONFIRMATIONS_DEGAGEE * 100));

    echo json_encode([
        'id' => (int) $s['id'],
        'zone' => libelleZone($s),
        'adresse_complete' => $s['adresse_formatee'],
        'gravite_classe' => graviteClasse($s['gravite']),
        'gravite_label' => graviteLabel($s['gravite']),
        'statut' => $s['statut'],
        'valide' => $estValide,
        'nb_confirmations' => $nbBloquees,
        'seuil_validation' => SEUIL_CONFIRMATIONS_VALIDATION,
        'nb_degagees' => $nbDegagees,
        'seuil_degagees' => SEUIL_CONFIRMATIONS_DEGAGEE,
        'seuil_atteint' => $nbDegagees >= SEUIL_CONFIRMATIONS_DEGAGEE,
        'progression_degagee' => $progression,
        // Une fois validé, le signalement ne s'archive plus jamais tout seul :
        // il n'y a donc plus de compte à rebours à afficher.
        'temps_restant' => $estValide ? null : tempsRestant($base),
        'photo' => $s['photo'] ? '../backend/uploads/' . $s['photo'] : null,
        'lien_maps' => ($s['latitude'] !== null && $s['longitude'] !== null)
            ? "https://www.google.com/maps?q={$s['latitude']},{$s['longitude']}"
            : null,
    ]);
    exit;
}

// ================================================
// POST : confirmer ou infirmer
// ================================================
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
    if (!in_array($action, ['toujours_bloquee', 'voie_degagee', 'confirmer_degagement'], true)) {
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
    if ($signalement['statut'] !== 'actif') {
        http_response_code(410);
        echo json_encode(['erreur' => 'Ce signalement a déjà été archivé.']);
        exit;
    }

    // ================================================
    // Action "confirmer_degagement" : archivage DÉFINITIF, déclenché par un clic
    // explicite une fois que le seuil de 3 confirmations est déjà atteint.
    // Ne passe PAS par la table confirmations (ce n'est pas un vote, juste le
    // geste final qui retire la voie de la liste).
    // ================================================
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

        // Répond tout de suite, puis notifie les abonnés en arrière-plan
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

            $stmtZoneNom = $pdo->prepare("SELECT quartier, ville FROM signalements WHERE id = ?");
            $stmtZoneNom->execute([$signalementId]);
            $ligneZone = $stmtZoneNom->fetch();
            $nomZone = ($ligneZone['quartier'] ?: $ligneZone['ville']) ?: 'Une voie';

            $payloadNotification = json_encode([
                'titre' => 'ClearWay Bénin',
                'message' => $nomZone . ' a été confirmée dégagée par la communauté — la voie est de nouveau praticable.',
            ]);

            $webpush = new WebPush(VAPID_CLE_PUBLIQUE, VAPID_CLE_PRIVEE, VAPID_SUBJECT);
            $abonnements = $pdo->query("SELECT id, endpoint, p256dh, auth_secret FROM push_subscriptions")->fetchAll();

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

    // Garde-fou serveur : un même visiteur ne peut confirmer qu'une seule fois
    // par signalement et par type d'action (en plus du verrou côté navigateur,
    // pour éviter le contournement en vidant le localStorage)
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
        // Réinitialise le compte à rebours de 3h (utile tant que le signalement
        // n'est pas encore validé par la communauté)
        $pdo->prepare("UPDATE signalements SET derniere_confirmation = NOW() WHERE id = ?")
            ->execute([$signalementId]);

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

    // ---- action === 'voie_degagee' : compte les visiteurs distincts, mais n'archive plus
    // jamais automatiquement — une fois le seuil atteint, la carte affiche un badge
    // "Récemment dégagée" et attend un clic explicite (action confirmer_degagement) ----
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
