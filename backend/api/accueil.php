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
// ClearWay Bénin - API Accueil
// Retourne : stats (voies bloquées / signalements actifs) + 3 derniers signalements
// ============================================

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/db.php';



// Nombre de voies bloquées = signalements actifs, gravité sévère ou modérée (hors "Praticable")
$nbBloquees = $pdo->query(
    "SELECT COUNT(*) AS total FROM signalements WHERE statut = 'actif' AND gravite IN ('Severe','Modere')"
)->fetch()['total'];

// Nombre total de signalements actifs
$nbActifs = $pdo->query(
    "SELECT COUNT(*) AS total FROM signalements WHERE statut = 'actif'"
)->fetch()['total'];

// 3 derniers signalements
$sql = "
    SELECT s.id, s.type_obstacle, s.gravite, s.date_creation, s.description, s.valide,
           s.latitude, s.longitude, s.pays, s.ville, s.quartier,
           (SELECT COUNT(DISTINCT COALESCE(visiteur_id, ip_utilisateur)) FROM confirmations c WHERE c.signalement_id = s.id AND c.type_confirmation = 'toujours_bloquee') AS nb_confirmations
    FROM signalements s
    WHERE s.statut = 'actif'
    ORDER BY s.date_creation DESC
    LIMIT 3
";
$rows = $pdo->query($sql)->fetchAll();

// Tronque la description aux ~8 premiers mots, pour un aperçu sur les cartes
function tronquerDescription($texte, $nbMots = 8) {
    if (!$texte) return '';
    $mots = preg_split('/\s+/', trim($texte));
    if (count($mots) <= $nbMots) {
        return implode(' ', $mots);
    }
    return implode(' ', array_slice($mots, 0, $nbMots)) . '…';
}

function graviteClasse($gravite) {
    return match ($gravite) {
        'Severe' => 'severe',
        'Modere' => 'modere',
        default => 'praticable', // Leger ou Praticable -> point vert
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

function graviteLabel($gravite) {
    return match ($gravite) {
        'Severe' => 'Sévère',
        'Modere' => 'Modéré',
        'Praticable' => 'Praticable',
        default => 'Léger',
    };
}

// Formate en français : "Aujourd'hui à 14h32", "Hier à 09h10", ou "12 juil. à 18h05"
function formaterDateHeure($date) {
    $timestamp = strtotime($date);
    $heure = date('H\hi', $timestamp);
    $jourSignalement = date('Y-m-d', $timestamp);
    $aujourdhui = date('Y-m-d');
    $hier = date('Y-m-d', strtotime('-1 day'));

    if ($jourSignalement === $aujourdhui) {
        return "Aujourd'hui à {$heure}";
    }
    if ($jourSignalement === $hier) {
        return "Hier à {$heure}";
    }

    $mois = ['jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    $jour = date('j', $timestamp);
    $moisTexte = $mois[(int) date('n', $timestamp) - 1];
    return "{$jour} {$moisTexte} à {$heure}";
}

$signalements = array_map(function ($s) {
    // "Nouveau" = signalement créé il y a moins de 30 minutes
    $minutesEcoulees = (time() - strtotime($s['date_creation'])) / 60;
    $estNouveau = $minutesEcoulees < 30;

    return [
        'id' => (int) $s['id'],
        'zone' => libelleZone($s),
        'type_obstacle' => $s['type_obstacle'],
        'gravite_classe' => graviteClasse($s['gravite']),
        'gravite_label' => graviteLabel($s['gravite']),
        'valide' => (bool) $s['valide'],
        'nb_confirmations' => (int) $s['nb_confirmations'],
        'date_heure' => formaterDateHeure($s['date_creation']),
        'description_apercu' => tronquerDescription($s['description']),
        'est_nouveau' => $estNouveau,
    ];
}, $rows);

echo json_encode([
    'nb_bloquees' => (int) $nbBloquees,
    'nb_actifs' => (int) $nbActifs,
    'derniers_signalements' => $signalements,
]);
