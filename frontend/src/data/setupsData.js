// Mock setup data for F1 25 tracks
// This data structure represents real F1 25 setup values and field names
// Setup data covers all tracks available in the project's TRACK_ID_TO_NAME mapping

export const SETUP_DATA = {
  "track_0": { // Melbourne
    // Real McLaren Time Trial setup (1:15.222, Dry) by Lukas9627, sourced from
    // simracingsetup.com/setups/f1-25-setups/australian-grand-prix-2025-mclaren-dry-115222/
    trackName: "Melbourne",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 23, min: 0, max: 50 },
      rearWing: { value: 15, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 55, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 30, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 1, min: 1, max: 21 },
      rearAntiRollBar: { value: 1, min: 1, max: 21 },
      frontRideHeight: { value: 21, min: 15, max: 35 },
      rearRideHeight: { value: 48, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 51, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 20.5, min: 20.5, max: 26.5 },
    },
  },
  "track_2": { // Shanghai
    // Real Racing Bulls Time Trial setup (1:33.029, Dry) by DanyRic7, sourced from
    // simracingsetup.com/setups/f1-25-setups/chinese-grand-prix-2025-racing-bulls-dry-133-029/
    trackName: "Shanghai",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 26, min: 0, max: 50 },
      rearWing: { value: 23, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 53, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 45, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 1, min: 1, max: 21 },
      rearAntiRollBar: { value: 6, min: 1, max: 21 },
      frontRideHeight: { value: 21, min: 15, max: 35 },
      rearRideHeight: { value: 48, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 20.5, min: 20.5, max: 26.5 },
    },
  },
  "track_3": { // Sakhir (Bahrain)
    // MOCK DATA: real setup unavailable. Every Wayback Machine snapshot for this
    // simracingsetup.com detail page returns 404 despite multiple confirmed-200 CDX
    // timestamps tried; this is a permanent gap in archive coverage.
    trackName: "Sakhir (Bahrain)",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 12, min: 0, max: 50 },
      rearWing: { value: 18, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 52, min: 50, max: 100 },
      onThrottle: { value: 65, min: 10, max: 100 },
      offThrottle: { value: 55, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.0, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.2, min: -2.0, max: -1.0 },
      frontToe: { value: 0.06, min: 0, max: 0.2 },
      rearToe: { value: 0.28, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 3, min: 1, max: 11 },
      rearSuspension: { value: 2, min: 1, max: 41 },
      frontAntiRollBar: { value: 2, min: 1, max: 21 },
      rearAntiRollBar: { value: 4, min: 1, max: 21 },
      frontRideHeight: { value: 22, min: 15, max: 35 },
      rearRideHeight: { value: 38, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 95, min: 80, max: 100 },
      brakeBias: { value: 56, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.0, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 22.5, min: 20.5, max: 26.5 },
    },
  },
  "track_4": { // Catalunya
    // Real Williams Time Trial setup (1:11.795, Dry) by KARL_24, sourced from
    // simracingsetup.com/setups/f1-25-setups/spanish-grand-prix-2025-williams-dry-111-795/
    trackName: "Catalunya",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 40, min: 0, max: 50 },
      rearWing: { value: 30, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 54, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 20, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 11, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 20, min: 15, max: 35 },
      rearRideHeight: { value: 48, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 20.5, min: 20.5, max: 26.5 },
    },
  },
  "track_5": { // Monaco
    // MOCK DATA: real setup unavailable. Every Wayback Machine snapshot for this
    // simracingsetup.com detail page returns 404 despite multiple confirmed-200 CDX
    // timestamps tried; this is a permanent gap in archive coverage.
    trackName: "Monaco",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 42, min: 0, max: 50 },
      rearWing: { value: 48, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 68, min: 50, max: 100 },
      onThrottle: { value: 80, min: 10, max: 100 },
      offThrottle: { value: 72, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0.12, min: 0, max: 0.2 },
      rearToe: { value: 0.42, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 9, min: 1, max: 11 },
      rearSuspension: { value: 8, min: 1, max: 41 },
      frontAntiRollBar: { value: 9, min: 1, max: 21 },
      rearAntiRollBar: { value: 10, min: 1, max: 21 },
      frontRideHeight: { value: 48, min: 15, max: 35 },
      rearRideHeight: { value: 62, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 58, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 22.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 21.0, min: 20.5, max: 26.5 },
    },
  },
  "track_6": { // Montreal
    // Real Racing Bulls Time Trial setup (1:10.422, Dry) by DanyRic7, sourced from
    // simracingsetup.com/setups/f1-25-setups/canadian-grand-prix-2025-racing-bulls-dry-110-422/
    trackName: "Montreal",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 35, min: 0, max: 50 },
      rearWing: { value: 25, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 51, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 15, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 4, min: 1, max: 41 },
      frontAntiRollBar: { value: 4, min: 1, max: 21 },
      rearAntiRollBar: { value: 4, min: 1, max: 21 },
      frontRideHeight: { value: 20, min: 15, max: 35 },
      rearRideHeight: { value: 49, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 26.5, min: 20.5, max: 26.5 },
    },
  },
  "track_7": { // Silverstone
    // MOCK DATA: real setup unavailable. Every Wayback Machine snapshot for this
    // simracingsetup.com detail page returns 404 despite multiple confirmed-200 CDX
    // timestamps tried; this is a permanent gap in archive coverage.
    trackName: "Silverstone",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 20, min: 0, max: 50 },
      rearWing: { value: 24, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 50, min: 50, max: 100 },
      onThrottle: { value: 62, min: 10, max: 100 },
      offThrottle: { value: 52, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.2, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.6, min: -2.0, max: -1.0 },
      frontToe: { value: 0.07, min: 0, max: 0.2 },
      rearToe: { value: 0.25, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 4, min: 1, max: 11 },
      rearSuspension: { value: 3, min: 1, max: 41 },
      frontAntiRollBar: { value: 3, min: 1, max: 21 },
      rearAntiRollBar: { value: 5, min: 1, max: 21 },
      frontRideHeight: { value: 26, min: 15, max: 35 },
      rearRideHeight: { value: 42, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 88, min: 80, max: 100 },
      brakeBias: { value: 52, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.8, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 22.2, min: 20.5, max: 26.5 },
    },
  },
  "track_9": { // Hungaroring
    // Real Racing Bulls Time Trial setup (1:15.726, Dry) by DanyRic7, sourced from
    // simracingsetup.com/setups/f1-25-setups/hungarian-grand-prix-2025-racing-bulls-dry-115-726/
    trackName: "Hungaroring",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 50, min: 0, max: 50 },
      rearWing: { value: 50, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 65, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 30, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 37, min: 1, max: 41 },
      rearSuspension: { value: 15, min: 1, max: 41 },
      frontAntiRollBar: { value: 8, min: 1, max: 21 },
      rearAntiRollBar: { value: 14, min: 1, max: 21 },
      frontRideHeight: { value: 21, min: 15, max: 35 },
      rearRideHeight: { value: 44, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 27.0, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 23.9, min: 20.5, max: 26.5 },
    },
  },
  "track_10": { // Spa
    // Real Aston Martin Time Trial setup (1:41.916, Dry) by KARL_24, sourced from
    // simracingsetup.com/setups/f1-25-setups/belgian-grand-prix-2025-aston-martin-dry-141-916/
    trackName: "Spa",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 0, min: 0, max: 50 },
      rearWing: { value: 0, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 58, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 20, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 15, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 21, min: 15, max: 35 },
      rearRideHeight: { value: 46, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 26.5, min: 20.5, max: 26.5 },
    },
  },
  "track_11": { // Monza
    // Real Ferrari Time Trial setup (1:18.191, Dry) by KARL_24, sourced from
    // simracingsetup.com/setups/f1-25-setups/italian-grand-prix-2025-ferrari-dry-118-191/
    trackName: "Monza",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 3, min: 0, max: 50 },
      rearWing: { value: 0, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 50, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 20, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 8, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 20, min: 15, max: 35 },
      rearRideHeight: { value: 48, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 26.5, min: 20.5, max: 26.5 },
    },
  },
  "track_12": { // Singapore
    // Real Aston Martin Time Trial setup (1:27.810, Dry) by KARL_24, sourced from
    // simracingsetup.com/setups/f1-25-setups/singapore-grand-prix-2025-aston-martin-dry-127-810/
    trackName: "Singapore",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 50, min: 0, max: 50 },
      rearWing: { value: 47, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 66, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 15, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 16, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 20, min: 15, max: 35 },
      rearRideHeight: { value: 50, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 22.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 20.5, min: 20.5, max: 26.5 },
    },
  },
  "track_13": { // Suzuka
    // Real Racing Bulls Time Trial setup (1:27.002, Dry) by KARL_24, sourced from
    // simracingsetup.com/setups/f1-25-setups/netherlands-grand-prix-2025-racing-bulls-dry-127-002/ (Japan page's community entry; site slug mislabeled "netherlands")
    trackName: "Suzuka",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 33, min: 0, max: 50 },
      rearWing: { value: 29, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 54, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 30, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 10, min: 1, max: 41 },
      frontAntiRollBar: { value: 10, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 22, min: 15, max: 35 },
      rearRideHeight: { value: 45, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 22.5, min: 20.5, max: 26.5 },
    },
  },
  "track_14": { // Abu Dhabi
    // Real Racing Bulls Time Trial setup (1:23.486, Dry) by DanyRic7, sourced from
    // simracingsetup.com/setups/f1-25-setups/abu-dhabi-grand-prix-2025-racing-bulls-dry-123-486/
    trackName: "Abu Dhabi",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 37, min: 0, max: 50 },
      rearWing: { value: 33, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 53, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 30, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 1, min: 1, max: 21 },
      rearAntiRollBar: { value: 9, min: 1, max: 21 },
      frontRideHeight: { value: 20, min: 15, max: 35 },
      rearRideHeight: { value: 46, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 51, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 20.9, min: 20.5, max: 26.5 },
    },
  },
  "track_15": { // Texas (COTA)
    // Real Racing Bulls Time Trial setup (1:32.989, Dry) by DanyRic7, sourced from
    // simracingsetup.com/setups/f1-25-setups/united-states-grand-prix-2025-racing-bulls-dry-132-989/
    trackName: "Texas",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 45, min: 0, max: 50 },
      rearWing: { value: 38, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 52, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 20, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 4, min: 1, max: 41 },
      frontAntiRollBar: { value: 21, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 21, min: 15, max: 35 },
      rearRideHeight: { value: 50, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 26.5, min: 20.5, max: 26.5 },
    },
  },
  "track_16": { // Brazil (Interlagos)
    // Real Red Bull Time Trial setup (1:07.142, Dry) by KARL_24, sourced from
    // simracingsetup.com/setups/f1-25-setups/brazilian-grand-prix-2025-red-bull-dry-107-142/
    trackName: "Brazil",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 38, min: 0, max: 50 },
      rearWing: { value: 34, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 56, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 15, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0.02, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 7, min: 1, max: 21 },
      rearAntiRollBar: { value: 17, min: 1, max: 21 },
      frontRideHeight: { value: 21, min: 15, max: 35 },
      rearRideHeight: { value: 48, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 52, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 20.5, min: 20.5, max: 26.5 },
    },
  },
  "track_17": { // Austria (Red Bull Ring)
    // MOCK DATA: real setup unavailable. Every Wayback Machine snapshot for this
    // simracingsetup.com detail page returns 404 despite multiple confirmed-200 CDX
    // timestamps tried; this is a permanent gap in archive coverage.
    trackName: "Austria",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 14, min: 0, max: 50 },
      rearWing: { value: 19, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 51, min: 50, max: 100 },
      onThrottle: { value: 63, min: 10, max: 100 },
      offThrottle: { value: 53, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.1, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.5, min: -2.0, max: -1.0 },
      frontToe: { value: 0.06, min: 0, max: 0.2 },
      rearToe: { value: 0.27, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 3, min: 1, max: 11 },
      rearSuspension: { value: 2, min: 1, max: 41 },
      frontAntiRollBar: { value: 2, min: 1, max: 21 },
      rearAntiRollBar: { value: 4, min: 1, max: 21 },
      frontRideHeight: { value: 20, min: 15, max: 35 },
      rearRideHeight: { value: 37, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 89, min: 80, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.1, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 22.6, min: 20.5, max: 26.5 },
    },
  },
  "track_19": { // Mexico
    // Real Ferrari Time Trial setup (1:14.626, Dry) by KARL_24, sourced from
    // simracingsetup.com/setups/f1-25-setups/mexican-grand-prix-2025-ferrari-dry-114-626/
    trackName: "Mexico",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 40, min: 0, max: 50 },
      rearWing: { value: 34, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 60, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 35, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 32, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 9, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 23, min: 15, max: 35 },
      rearRideHeight: { value: 45, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.2, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 20.5, min: 20.5, max: 26.5 },
    },
  },
  "track_20": { // Baku (Azerbaijan)
    // Real Racing Bulls Time Trial setup (1:39.722, Dry) by DanyRic7, sourced from
    // simracingsetup.com/setups/f1-25-setups/azerbaijan-grand-prix-2025-racing-bulls-dry-139-722/
    trackName: "Baku (Azerbaijan)",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 12, min: 0, max: 50 },
      rearWing: { value: 12, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 50, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 35, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 11, min: 1, max: 41 },
      frontAntiRollBar: { value: 11, min: 1, max: 21 },
      rearAntiRollBar: { value: 9, min: 1, max: 21 },
      frontRideHeight: { value: 20, min: 15, max: 35 },
      rearRideHeight: { value: 46, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 52, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.3, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 21.5, min: 20.5, max: 26.5 },
    },
  },
  "track_26": { // Zandvoort
    // Real Racing Bulls Time Trial setup (1:09.985, Dry) by DanyRic7, sourced from
    // simracingsetup.com/setups/f1-25-setups/netherlands-grand-prix-2025-racing-bulls-dry-109-985/
    trackName: "Zandvoort",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 50, min: 0, max: 50 },
      rearWing: { value: 50, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 62, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 20, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 8, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 24, min: 15, max: 35 },
      rearRideHeight: { value: 48, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.1, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 20.9, min: 20.5, max: 26.5 },
    },
  },
  "track_27": { // Imola
    // Real Haas Time Trial setup (1:13.914, Dry) by KARL_24, sourced from
    // simracingsetup.com/setups/f1-25-setups/imola-grand-prix-2025-haas-dry-113-914/
    trackName: "Imola",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 42, min: 0, max: 50 },
      rearWing: { value: 35, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 58, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 45, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 13, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 22, min: 15, max: 35 },
      rearRideHeight: { value: 51, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 52, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 22.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 20.5, min: 20.5, max: 26.5 },
    },
  },
  "track_29": { // Jeddah
    // Real Racing Bulls Time Trial setup (1:27.982, Dry) by DanyRic7, sourced from
    // simracingsetup.com/setups/f1-25-setups/saudi-arabian-grand-prix-2025-racing-bulls-dry-127-982/
    trackName: "Jeddah",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 14, min: 0, max: 50 },
      rearWing: { value: 10, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 51, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 55, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 1, min: 1, max: 41 },
      frontAntiRollBar: { value: 1, min: 1, max: 21 },
      rearAntiRollBar: { value: 6, min: 1, max: 21 },
      frontRideHeight: { value: 21, min: 15, max: 35 },
      rearRideHeight: { value: 48, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 26.5, min: 20.5, max: 26.5 },
    },
  },
  "track_30": { // Miami
    // Real Racing Bulls Time Trial setup (1:26.121, Dry) by DanyRic7, sourced from
    // simracingsetup.com/setups/f1-25-setups/miami-grand-prix-2025-racing-bulls-dry-126-121/
    trackName: "Miami",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 12, min: 0, max: 50 },
      rearWing: { value: 12, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 52, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 50, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 7, min: 1, max: 41 },
      frontAntiRollBar: { value: 6, min: 1, max: 21 },
      rearAntiRollBar: { value: 10, min: 1, max: 21 },
      frontRideHeight: { value: 20, min: 15, max: 35 },
      rearRideHeight: { value: 47, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 20.5, min: 20.5, max: 26.5 },
    },
  },
  "track_31": { // Las Vegas
    // Real Racing Bulls Time Trial setup (1:31.770, Dry) by DanyRic7, sourced from
    // simracingsetup.com/setups/f1-25-setups/las-vegas-grand-prix-2025-racing-bulls-dry-131-770/
    trackName: "Las Vegas",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 0, min: 0, max: 50 },
      rearWing: { value: 0, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 50, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 20, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 6, min: 1, max: 41 },
      frontAntiRollBar: { value: 5, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 23, min: 15, max: 35 },
      rearRideHeight: { value: 48, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 22.0, min: 20.5, max: 26.5 },
    },
  },
  "track_32": { // Losail (Qatar)
    // Real Ferrari Time Trial setup (1:21.055, Dry) by KARL_24, sourced from
    // simracingsetup.com/setups/f1-25-setups/qatar-grand-prix-2025-ferrari-dry-121-055/
    trackName: "Losail",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 42, min: 0, max: 50 },
      rearWing: { value: 35, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 52, min: 50, max: 100 },
      onThrottle: { value: 100, min: 10, max: 100 },
      offThrottle: { value: 25, min: 0, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -2.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0, min: 0, max: 0.2 },
      rearToe: { value: 0.1, min: 0.1, max: 0.25 },
    },
    suspension: {
      frontSuspension: { value: 41, min: 1, max: 41 },
      rearSuspension: { value: 4, min: 1, max: 41 },
      frontAntiRollBar: { value: 12, min: 1, max: 21 },
      rearAntiRollBar: { value: 21, min: 1, max: 21 },
      frontRideHeight: { value: 21, min: 15, max: 35 },
      rearRideHeight: { value: 47, min: 40, max: 60 },
    },
    brakes: {
      brakePressure: { value: 100, min: 80, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 29.5, min: 22.5, max: 29.5 },
      rearTyrePressure: { value: 21.0, min: 20.5, max: 26.5 },
    },
  },
};

// Get available track keys for the dropdown
export function getAvailableTrackKeys() {
  return Object.keys(SETUP_DATA);
}

// Get setup data for a specific track
export function getSetupForTrack(trackKey) {
  return SETUP_DATA[trackKey] || null;
}
