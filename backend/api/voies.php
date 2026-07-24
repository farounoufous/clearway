<?php

header("Access-Control-Allow-Origin: https://clearway-production-6e27.up.railway.app"); // ⚠️ REMPLACEZ par votre vraie URL Vercel
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

// Si c'est une requête de pré-vérification (OPTIONS), on arrête le script immédiatement
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}


// ============================================
// ClearWay Bénin - API Voies impraticables
// - Archive automatiquement les signalements NON VALIDÉS sans confirmation depuis 3h
// - Un signalement validé (>= 3 confirmations "toujours bloquée" de visiteurs
//   distincts) n'est plus jamais archivé par ce mécanisme : il ne disparaît
//   que via le circuit "voie dégagée" + confirmer_degagement (voir confirmation.php)
// - Retourne la liste triée : Sévère > Modéré > Praticable (puis plus récent d'abord)
// ============================================

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';

// ---- 1. Archivage automatique : 3h sans confirmation depuis la création
//         ou depuis la dernière confirmation, UNIQUEMENT si le signalement
//         n'a pas encore été validé par la communauté ----
$pdo->exec("
    UPDATE signalements
    SET statut = 'archive', date_archivage = NOW()
    WHERE statut = 'actif'
      AND valide = 0
      AND TIMESTAMPDIFF(HOUR, COALESCE(derniere_confirmation, date_creation), NOW()) >= 3
");

// ---- 2. Récupération des signalements actifs, triés par gravité puis date ----
$sql = "
    SELECT s.id, s.type_obstacle, s.gravite, s.date_creation, s.derniere_confirmation, s.valide, s.photo,
           s.latitude, s.longitude, s.pays, s.ville, s.quartier, s.adresse_formatee,
           (SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) FROM confirmations c WHERE c.signalement_id = s.id AND c.type_confirmation = 'toujours_bloquee') AS nb_confirmations,
           (SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) FROM confirmations c WHERE c.signalement_id = s.id AND c.type_confirmation = 'voie_degagee') AS nb_degagees
    FROM signalements s
    WHERE s.statut = 'actif'
    ORDER BY FIELD(s.gravite, 'Severe', 'Modere', 'Leger', 'Praticable'), s.date_creation DESC
";
$rows = $pdo->query($sql)->fetchAll();

const SEUIL_CONFIRMATIONS_DEGAGEE = 3;

// Libellé de secours : quartier > ville > pays > coordonnées brutes,
// pour toujours avoir quelque chose d'affichable même si le géocodage
// inversé a échoué (ou si l'utilisateur n'a pas complété le quartier)
function libelleZone($s) {
    if (!empty($s['quartier'])) return $s['quartier'];
    if (!empty($s['ville'])) return $s['ville'];
    if (!empty($s['pays'])) return $s['pays'];
    if ($s['latitude'] !== null && $s['longitude'] !== null) {
        return 'Position (' . round((float) $s['latitude'], 4) . ', ' . round((float) $s['longitude'], 4) . ')';
    }
    return 'Localisation inconnue';
}

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

$voies = array_map(function ($s) {
    $estValide = (bool) $s['valide'];
    $base = $s['derniere_confirmation'] ?? $s['date_creation'];
    // Une fois validé, il n'y a plus d'archivage auto à annoncer
    $heureArchivage = $estValide ? null : date('H\hi', strtotime($base . ' +3 hours'));

    // "Nouveau" = signalement créé il y a moins de 30 minutes
    $minutesEcoulees = (time() - strtotime($s['date_creation'])) / 60;
    $estNouveau = $minutesEcoulees < 30;

    return [
        'id' => (int) $s['id'],
        'zone' => libelleZone($s),
        'adresse_complete' => $s['adresse_formatee'],
        'gravite_classe' => graviteClasse($s['gravite']),
        'gravite_label' => graviteLabel($s['gravite']),
        'type_obstacle' => $s['type_obstacle'],
        'valide' => $estValide,
        'nb_confirmations' => (int) $s['nb_confirmations'],
        'nb_degagees' => (int) $s['nb_degagees'],
        'progression_degagee' => min(100, (int) round((int) $s['nb_degagees'] / SEUIL_CONFIRMATIONS_DEGAGEE * 100)),
        'heure_archivage' => $heureArchivage,
        'photo' => $s['photo'] ? '../backend/uploads/' . $s['photo'] : null,
        'est_nouveau' => $estNouveau,
        'recemment_degagee' => (int) $s['nb_degagees'] >= SEUIL_CONFIRMATIONS_DEGAGEE,
        'lien_maps' => ($s['latitude'] !== null && $s['longitude'] !== null)
            ? "https://www.google.com/maps?q={$s['latitude']},{$s['longitude']}"
            : null,
    ];
}, $rows);

echo json_encode($voies);
