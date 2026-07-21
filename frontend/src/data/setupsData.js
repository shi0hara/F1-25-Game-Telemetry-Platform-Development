// Mock setup data for F1 25 tracks
// This data structure represents real F1 25 setup values and field names
// Setup data covers all tracks available in the project's TRACK_ID_TO_NAME mapping

export const SETUP_DATA = {
  "track_0": { // Melbourne
    trackName: "Melbourne",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 28, min: 0, max: 50 },
      rearWing: { value: 32, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 55, min: 50, max: 100 },
      onThrottle: { value: 70, min: 50, max: 100 },
      offThrottle: { value: 60, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.8, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.5, min: -2.0, max: -1.0 },
      frontToe: { value: 0.08, min: 0.05, max: 0.25 },
      rearToe: { value: 0.32, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 6, min: 1, max: 11 },
      rearSuspension: { value: 5, min: 1, max: 11 },
      frontAntiRollBar: { value: 5, min: 1, max: 11 },
      rearAntiRollBar: { value: 7, min: 1, max: 11 },
      frontRideHeight: { value: 32, min: 0, max: 100 },
      rearRideHeight: { value: 50, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 92, min: 50, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.2, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 21.8, min: 19.0, max: 25.0 },
    },
  },
  "track_2": { // Shanghai
    trackName: "Shanghai",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 22, min: 0, max: 50 },
      rearWing: { value: 27, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 53, min: 50, max: 100 },
      onThrottle: { value: 67, min: 50, max: 100 },
      offThrottle: { value: 57, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.9, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.4, min: -2.0, max: -1.0 },
      frontToe: { value: 0.07, min: 0.05, max: 0.25 },
      rearToe: { value: 0.30, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 4, min: 1, max: 11 },
      rearSuspension: { value: 3, min: 1, max: 11 },
      frontAntiRollBar: { value: 4, min: 1, max: 11 },
      rearAntiRollBar: { value: 5, min: 1, max: 11 },
      frontRideHeight: { value: 27, min: 0, max: 100 },
      rearRideHeight: { value: 43, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 91, min: 50, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.6, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.1, min: 19.0, max: 25.0 },
    },
  },
  "track_3": { // Sakhir (Bahrain)
    trackName: "Sakhir (Bahrain)",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 12, min: 0, max: 50 },
      rearWing: { value: 18, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 52, min: 50, max: 100 },
      onThrottle: { value: 65, min: 50, max: 100 },
      offThrottle: { value: 55, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.0, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.2, min: -2.0, max: -1.0 },
      frontToe: { value: 0.06, min: 0.05, max: 0.25 },
      rearToe: { value: 0.28, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 3, min: 1, max: 11 },
      rearSuspension: { value: 2, min: 1, max: 11 },
      frontAntiRollBar: { value: 2, min: 1, max: 11 },
      rearAntiRollBar: { value: 4, min: 1, max: 11 },
      frontRideHeight: { value: 22, min: 0, max: 100 },
      rearRideHeight: { value: 38, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 95, min: 50, max: 100 },
      brakeBias: { value: 56, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.0, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.5, min: 19.0, max: 25.0 },
    },
  },
  "track_4": { // Catalunya
    trackName: "Catalunya",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 26, min: 0, max: 50 },
      rearWing: { value: 30, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 54, min: 50, max: 100 },
      onThrottle: { value: 68, min: 50, max: 100 },
      offThrottle: { value: 58, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.9, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.4, min: -2.0, max: -1.0 },
      frontToe: { value: 0.08, min: 0.05, max: 0.25 },
      rearToe: { value: 0.33, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 5, min: 1, max: 11 },
      rearSuspension: { value: 4, min: 1, max: 11 },
      frontAntiRollBar: { value: 5, min: 1, max: 11 },
      rearAntiRollBar: { value: 6, min: 1, max: 11 },
      frontRideHeight: { value: 29, min: 0, max: 100 },
      rearRideHeight: { value: 46, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 90, min: 50, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.4, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 21.9, min: 19.0, max: 25.0 },
    },
  },
  "track_5": { // Monaco
    trackName: "Monaco",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 42, min: 0, max: 50 },
      rearWing: { value: 48, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 68, min: 50, max: 100 },
      onThrottle: { value: 80, min: 50, max: 100 },
      offThrottle: { value: 72, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0.12, min: 0.05, max: 0.25 },
      rearToe: { value: 0.42, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 9, min: 1, max: 11 },
      rearSuspension: { value: 8, min: 1, max: 11 },
      frontAntiRollBar: { value: 9, min: 1, max: 11 },
      rearAntiRollBar: { value: 10, min: 1, max: 11 },
      frontRideHeight: { value: 48, min: 0, max: 100 },
      rearRideHeight: { value: 62, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 100, min: 50, max: 100 },
      brakeBias: { value: 58, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 22.5, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 21.0, min: 19.0, max: 25.0 },
    },
  },
  "track_6": { // Montreal
    trackName: "Montreal",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 18, min: 0, max: 50 },
      rearWing: { value: 23, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 51, min: 50, max: 100 },
      onThrottle: { value: 64, min: 50, max: 100 },
      offThrottle: { value: 54, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.1, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.5, min: -2.0, max: -1.0 },
      frontToe: { value: 0.07, min: 0.05, max: 0.25 },
      rearToe: { value: 0.29, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 4, min: 1, max: 11 },
      rearSuspension: { value: 3, min: 1, max: 11 },
      frontAntiRollBar: { value: 3, min: 1, max: 11 },
      rearAntiRollBar: { value: 5, min: 1, max: 11 },
      frontRideHeight: { value: 25, min: 0, max: 100 },
      rearRideHeight: { value: 41, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 94, min: 50, max: 100 },
      brakeBias: { value: 55, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.7, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.3, min: 19.0, max: 25.0 },
    },
  },
  "track_7": { // Silverstone
    trackName: "Silverstone",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 20, min: 0, max: 50 },
      rearWing: { value: 24, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 50, min: 50, max: 100 },
      onThrottle: { value: 62, min: 50, max: 100 },
      offThrottle: { value: 52, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.2, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.6, min: -2.0, max: -1.0 },
      frontToe: { value: 0.07, min: 0.05, max: 0.25 },
      rearToe: { value: 0.25, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 4, min: 1, max: 11 },
      rearSuspension: { value: 3, min: 1, max: 11 },
      frontAntiRollBar: { value: 3, min: 1, max: 11 },
      rearAntiRollBar: { value: 5, min: 1, max: 11 },
      frontRideHeight: { value: 26, min: 0, max: 100 },
      rearRideHeight: { value: 42, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 88, min: 50, max: 100 },
      brakeBias: { value: 52, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.8, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.2, min: 19.0, max: 25.0 },
    },
  },
  "track_9": { // Hungaroring
    trackName: "Hungaroring",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 38, min: 0, max: 50 },
      rearWing: { value: 44, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 65, min: 50, max: 100 },
      onThrottle: { value: 77, min: 50, max: 100 },
      offThrottle: { value: 68, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.6, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.1, min: -2.0, max: -1.0 },
      frontToe: { value: 0.10, min: 0.05, max: 0.25 },
      rearToe: { value: 0.40, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 8, min: 1, max: 11 },
      rearSuspension: { value: 7, min: 1, max: 11 },
      frontAntiRollBar: { value: 8, min: 1, max: 11 },
      rearAntiRollBar: { value: 9, min: 1, max: 11 },
      frontRideHeight: { value: 42, min: 0, max: 100 },
      rearRideHeight: { value: 58, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 97, min: 50, max: 100 },
      brakeBias: { value: 57, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 22.7, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 21.3, min: 19.0, max: 25.0 },
    },
  },
  "track_10": { // Spa
    trackName: "Spa",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 16, min: 0, max: 50 },
      rearWing: { value: 20, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 58, min: 50, max: 100 },
      onThrottle: { value: 68, min: 50, max: 100 },
      offThrottle: { value: 58, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.1, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.4, min: -2.0, max: -1.0 },
      frontToe: { value: 0.06, min: 0.05, max: 0.25 },
      rearToe: { value: 0.30, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 2, min: 1, max: 11 },
      rearSuspension: { value: 2, min: 1, max: 11 },
      frontAntiRollBar: { value: 1, min: 1, max: 11 },
      rearAntiRollBar: { value: 3, min: 1, max: 11 },
      frontRideHeight: { value: 18, min: 0, max: 100 },
      rearRideHeight: { value: 35, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 90, min: 50, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.2, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.8, min: 19.0, max: 25.0 },
    },
  },
  "track_11": { // Monza
    trackName: "Monza",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 8, min: 0, max: 50 },
      rearWing: { value: 12, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 50, min: 50, max: 100 },
      onThrottle: { value: 60, min: 50, max: 100 },
      offThrottle: { value: 50, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.3, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.7, min: -2.0, max: -1.0 },
      frontToe: { value: 0.05, min: 0.05, max: 0.25 },
      rearToe: { value: 0.22, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 1, min: 1, max: 11 },
      rearSuspension: { value: 1, min: 1, max: 11 },
      frontAntiRollBar: { value: 1, min: 1, max: 11 },
      rearAntiRollBar: { value: 2, min: 1, max: 11 },
      frontRideHeight: { value: 15, min: 0, max: 100 },
      rearRideHeight: { value: 30, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 85, min: 50, max: 100 },
      brakeBias: { value: 50, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.5, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 23.0, min: 19.0, max: 25.0 },
    },
  },
  "track_12": { // Singapore
    trackName: "Singapore",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 40, min: 0, max: 50 },
      rearWing: { value: 46, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 66, min: 50, max: 100 },
      onThrottle: { value: 78, min: 50, max: 100 },
      offThrottle: { value: 70, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.5, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.0, min: -2.0, max: -1.0 },
      frontToe: { value: 0.11, min: 0.05, max: 0.25 },
      rearToe: { value: 0.41, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 9, min: 1, max: 11 },
      rearSuspension: { value: 8, min: 1, max: 11 },
      frontAntiRollBar: { value: 8, min: 1, max: 11 },
      rearAntiRollBar: { value: 9, min: 1, max: 11 },
      frontRideHeight: { value: 46, min: 0, max: 100 },
      rearRideHeight: { value: 60, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 98, min: 50, max: 100 },
      brakeBias: { value: 58, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 22.6, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 21.2, min: 19.0, max: 25.0 },
    },
  },
  "track_13": { // Suzuka
    trackName: "Suzuka",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 25, min: 0, max: 50 },
      rearWing: { value: 30, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 54, min: 50, max: 100 },
      onThrottle: { value: 66, min: 50, max: 100 },
      offThrottle: { value: 56, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.9, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.3, min: -2.0, max: -1.0 },
      frontToe: { value: 0.09, min: 0.05, max: 0.25 },
      rearToe: { value: 0.35, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 5, min: 1, max: 11 },
      rearSuspension: { value: 4, min: 1, max: 11 },
      frontAntiRollBar: { value: 4, min: 1, max: 11 },
      rearAntiRollBar: { value: 6, min: 1, max: 11 },
      frontRideHeight: { value: 28, min: 0, max: 100 },
      rearRideHeight: { value: 45, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 93, min: 50, max: 100 },
      brakeBias: { value: 55, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.5, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.0, min: 19.0, max: 25.0 },
    },
  },
  "track_14": { // Abu Dhabi
    trackName: "Abu Dhabi",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 24, min: 0, max: 50 },
      rearWing: { value: 28, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 53, min: 50, max: 100 },
      onThrottle: { value: 66, min: 50, max: 100 },
      offThrottle: { value: 56, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.9, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.4, min: -2.0, max: -1.0 },
      frontToe: { value: 0.08, min: 0.05, max: 0.25 },
      rearToe: { value: 0.31, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 5, min: 1, max: 11 },
      rearSuspension: { value: 4, min: 1, max: 11 },
      frontAntiRollBar: { value: 4, min: 1, max: 11 },
      rearAntiRollBar: { value: 6, min: 1, max: 11 },
      frontRideHeight: { value: 28, min: 0, max: 100 },
      rearRideHeight: { value: 44, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 91, min: 50, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.6, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.1, min: 19.0, max: 25.0 },
    },
  },
  "track_15": { // Texas (COTA)
    trackName: "Texas",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 23, min: 0, max: 50 },
      rearWing: { value: 27, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 52, min: 50, max: 100 },
      onThrottle: { value: 65, min: 50, max: 100 },
      offThrottle: { value: 55, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.0, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.4, min: -2.0, max: -1.0 },
      frontToe: { value: 0.07, min: 0.05, max: 0.25 },
      rearToe: { value: 0.29, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 4, min: 1, max: 11 },
      rearSuspension: { value: 3, min: 1, max: 11 },
      frontAntiRollBar: { value: 3, min: 1, max: 11 },
      rearAntiRollBar: { value: 5, min: 1, max: 11 },
      frontRideHeight: { value: 26, min: 0, max: 100 },
      rearRideHeight: { value: 42, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 92, min: 50, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.7, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.2, min: 19.0, max: 25.0 },
    },
  },
  "track_16": { // Brazil (Interlagos)
    trackName: "Brazil",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 30, min: 0, max: 50 },
      rearWing: { value: 35, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 56, min: 50, max: 100 },
      onThrottle: { value: 69, min: 50, max: 100 },
      offThrottle: { value: 59, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.8, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.3, min: -2.0, max: -1.0 },
      frontToe: { value: 0.09, min: 0.05, max: 0.25 },
      rearToe: { value: 0.34, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 6, min: 1, max: 11 },
      rearSuspension: { value: 5, min: 1, max: 11 },
      frontAntiRollBar: { value: 6, min: 1, max: 11 },
      rearAntiRollBar: { value: 7, min: 1, max: 11 },
      frontRideHeight: { value: 33, min: 0, max: 100 },
      rearRideHeight: { value: 49, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 93, min: 50, max: 100 },
      brakeBias: { value: 55, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.3, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 21.8, min: 19.0, max: 25.0 },
    },
  },
  "track_17": { // Austria (Red Bull Ring)
    trackName: "Austria",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 14, min: 0, max: 50 },
      rearWing: { value: 19, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 51, min: 50, max: 100 },
      onThrottle: { value: 63, min: 50, max: 100 },
      offThrottle: { value: 53, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.1, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.5, min: -2.0, max: -1.0 },
      frontToe: { value: 0.06, min: 0.05, max: 0.25 },
      rearToe: { value: 0.27, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 3, min: 1, max: 11 },
      rearSuspension: { value: 2, min: 1, max: 11 },
      frontAntiRollBar: { value: 2, min: 1, max: 11 },
      rearAntiRollBar: { value: 4, min: 1, max: 11 },
      frontRideHeight: { value: 20, min: 0, max: 100 },
      rearRideHeight: { value: 37, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 89, min: 50, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.1, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.6, min: 19.0, max: 25.0 },
    },
  },
  "track_19": { // Mexico
    trackName: "Mexico",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 36, min: 0, max: 50 },
      rearWing: { value: 42, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 60, min: 50, max: 100 },
      onThrottle: { value: 72, min: 50, max: 100 },
      offThrottle: { value: 63, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.7, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.2, min: -2.0, max: -1.0 },
      frontToe: { value: 0.10, min: 0.05, max: 0.25 },
      rearToe: { value: 0.37, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 7, min: 1, max: 11 },
      rearSuspension: { value: 6, min: 1, max: 11 },
      frontAntiRollBar: { value: 7, min: 1, max: 11 },
      rearAntiRollBar: { value: 8, min: 1, max: 11 },
      frontRideHeight: { value: 38, min: 0, max: 100 },
      rearRideHeight: { value: 54, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 94, min: 50, max: 100 },
      brakeBias: { value: 56, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.0, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 21.5, min: 19.0, max: 25.0 },
    },
  },
  "track_20": { // Baku (Azerbaijan)
    trackName: "Baku (Azerbaijan)",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 10, min: 0, max: 50 },
      rearWing: { value: 15, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 50, min: 50, max: 100 },
      onThrottle: { value: 61, min: 50, max: 100 },
      offThrottle: { value: 51, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.2, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.6, min: -2.0, max: -1.0 },
      frontToe: { value: 0.06, min: 0.05, max: 0.25 },
      rearToe: { value: 0.26, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 2, min: 1, max: 11 },
      rearSuspension: { value: 1, min: 1, max: 11 },
      frontAntiRollBar: { value: 2, min: 1, max: 11 },
      rearAntiRollBar: { value: 3, min: 1, max: 11 },
      frontRideHeight: { value: 17, min: 0, max: 100 },
      rearRideHeight: { value: 32, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 96, min: 50, max: 100 },
      brakeBias: { value: 56, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.3, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.9, min: 19.0, max: 25.0 },
    },
  },
  "track_26": { // Zandvoort
    trackName: "Zandvoort",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 35, min: 0, max: 50 },
      rearWing: { value: 40, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 62, min: 50, max: 100 },
      onThrottle: { value: 74, min: 50, max: 100 },
      offThrottle: { value: 65, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.6, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.1, min: -2.0, max: -1.0 },
      frontToe: { value: 0.11, min: 0.05, max: 0.25 },
      rearToe: { value: 0.38, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 8, min: 1, max: 11 },
      rearSuspension: { value: 7, min: 1, max: 11 },
      frontAntiRollBar: { value: 7, min: 1, max: 11 },
      rearAntiRollBar: { value: 8, min: 1, max: 11 },
      frontRideHeight: { value: 40, min: 0, max: 100 },
      rearRideHeight: { value: 56, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 96, min: 50, max: 100 },
      brakeBias: { value: 57, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 22.8, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 21.5, min: 19.0, max: 25.0 },
    },
  },
  "track_27": { // Imola
    trackName: "Imola",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 32, min: 0, max: 50 },
      rearWing: { value: 37, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 58, min: 50, max: 100 },
      onThrottle: { value: 70, min: 50, max: 100 },
      offThrottle: { value: 61, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.8, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.3, min: -2.0, max: -1.0 },
      frontToe: { value: 0.09, min: 0.05, max: 0.25 },
      rearToe: { value: 0.35, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 6, min: 1, max: 11 },
      rearSuspension: { value: 5, min: 1, max: 11 },
      frontAntiRollBar: { value: 6, min: 1, max: 11 },
      rearAntiRollBar: { value: 7, min: 1, max: 11 },
      frontRideHeight: { value: 34, min: 0, max: 100 },
      rearRideHeight: { value: 50, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 92, min: 50, max: 100 },
      brakeBias: { value: 55, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.4, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.0, min: 19.0, max: 25.0 },
    },
  },
  "track_29": { // Jeddah
    trackName: "Jeddah",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 15, min: 0, max: 50 },
      rearWing: { value: 20, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 51, min: 50, max: 100 },
      onThrottle: { value: 63, min: 50, max: 100 },
      offThrottle: { value: 53, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.1, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.5, min: -2.0, max: -1.0 },
      frontToe: { value: 0.06, min: 0.05, max: 0.25 },
      rearToe: { value: 0.28, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 3, min: 1, max: 11 },
      rearSuspension: { value: 2, min: 1, max: 11 },
      frontAntiRollBar: { value: 2, min: 1, max: 11 },
      rearAntiRollBar: { value: 4, min: 1, max: 11 },
      frontRideHeight: { value: 21, min: 0, max: 100 },
      rearRideHeight: { value: 38, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 94, min: 50, max: 100 },
      brakeBias: { value: 55, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.0, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.5, min: 19.0, max: 25.0 },
    },
  },
  "track_30": { // Miami
    trackName: "Miami",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 21, min: 0, max: 50 },
      rearWing: { value: 26, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 52, min: 50, max: 100 },
      onThrottle: { value: 65, min: 50, max: 100 },
      offThrottle: { value: 55, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.0, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.4, min: -2.0, max: -1.0 },
      frontToe: { value: 0.07, min: 0.05, max: 0.25 },
      rearToe: { value: 0.30, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 4, min: 1, max: 11 },
      rearSuspension: { value: 3, min: 1, max: 11 },
      frontAntiRollBar: { value: 4, min: 1, max: 11 },
      rearAntiRollBar: { value: 5, min: 1, max: 11 },
      frontRideHeight: { value: 25, min: 0, max: 100 },
      rearRideHeight: { value: 41, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 91, min: 50, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.8, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.3, min: 19.0, max: 25.0 },
    },
  },
  "track_31": { // Las Vegas
    trackName: "Las Vegas",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 9, min: 0, max: 50 },
      rearWing: { value: 14, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 50, min: 50, max: 100 },
      onThrottle: { value: 60, min: 50, max: 100 },
      offThrottle: { value: 50, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.3, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.7, min: -2.0, max: -1.0 },
      frontToe: { value: 0.05, min: 0.05, max: 0.25 },
      rearToe: { value: 0.23, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 1, min: 1, max: 11 },
      rearSuspension: { value: 1, min: 1, max: 11 },
      frontAntiRollBar: { value: 1, min: 1, max: 11 },
      rearAntiRollBar: { value: 2, min: 1, max: 11 },
      frontRideHeight: { value: 16, min: 0, max: 100 },
      rearRideHeight: { value: 31, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 87, min: 50, max: 100 },
      brakeBias: { value: 51, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.4, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 23.0, min: 19.0, max: 25.0 },
    },
  },
  "track_32": { // Losail (Qatar)
    trackName: "Losail",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 19, min: 0, max: 50 },
      rearWing: { value: 24, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 52, min: 50, max: 100 },
      onThrottle: { value: 64, min: 50, max: 100 },
      offThrottle: { value: 54, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.0, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.4, min: -2.0, max: -1.0 },
      frontToe: { value: 0.07, min: 0.05, max: 0.25 },
      rearToe: { value: 0.29, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 4, min: 1, max: 11 },
      rearSuspension: { value: 3, min: 1, max: 11 },
      frontAntiRollBar: { value: 3, min: 1, max: 11 },
      rearAntiRollBar: { value: 5, min: 1, max: 11 },
      frontRideHeight: { value: 24, min: 0, max: 100 },
      rearRideHeight: { value: 40, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 90, min: 50, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.9, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.4, min: 19.0, max: 25.0 },
    },
  },
  "track_39": { // Silverstone (Reverse)
    trackName: "Silverstone (Reverse)",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 21, min: 0, max: 50 },
      rearWing: { value: 25, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 51, min: 50, max: 100 },
      onThrottle: { value: 63, min: 50, max: 100 },
      offThrottle: { value: 53, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.1, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.5, min: -2.0, max: -1.0 },
      frontToe: { value: 0.07, min: 0.05, max: 0.25 },
      rearToe: { value: 0.27, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 4, min: 1, max: 11 },
      rearSuspension: { value: 3, min: 1, max: 11 },
      frontAntiRollBar: { value: 3, min: 1, max: 11 },
      rearAntiRollBar: { value: 5, min: 1, max: 11 },
      frontRideHeight: { value: 27, min: 0, max: 100 },
      rearRideHeight: { value: 43, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 89, min: 50, max: 100 },
      brakeBias: { value: 53, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 23.7, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.2, min: 19.0, max: 25.0 },
    },
  },
  "track_40": { // Austria (Reverse)
    trackName: "Austria (Reverse)",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 15, min: 0, max: 50 },
      rearWing: { value: 20, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 51, min: 50, max: 100 },
      onThrottle: { value: 63, min: 50, max: 100 },
      offThrottle: { value: 53, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -3.0, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.4, min: -2.0, max: -1.0 },
      frontToe: { value: 0.06, min: 0.05, max: 0.25 },
      rearToe: { value: 0.28, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 3, min: 1, max: 11 },
      rearSuspension: { value: 2, min: 1, max: 11 },
      frontAntiRollBar: { value: 2, min: 1, max: 11 },
      rearAntiRollBar: { value: 4, min: 1, max: 11 },
      frontRideHeight: { value: 21, min: 0, max: 100 },
      rearRideHeight: { value: 38, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 90, min: 50, max: 100 },
      brakeBias: { value: 54, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 24.0, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 22.5, min: 19.0, max: 25.0 },
    },
  },
  "track_41": { // Zandvoort (Reverse)
    trackName: "Zandvoort (Reverse)",
    setupType: "Dry Setup",
    aerodynamics: {
      frontWing: { value: 36, min: 0, max: 50 },
      rearWing: { value: 41, min: 0, max: 50 },
    },
    transmission: {
      differential: { value: 63, min: 50, max: 100 },
      onThrottle: { value: 75, min: 50, max: 100 },
      offThrottle: { value: 66, min: 50, max: 100 },
    },
    suspensionGeometry: {
      frontCamber: { value: -2.6, min: -3.5, max: -2.5 },
      rearCamber: { value: -1.1, min: -2.0, max: -1.0 },
      frontToe: { value: 0.11, min: 0.05, max: 0.25 },
      rearToe: { value: 0.39, min: 0.15, max: 0.50 },
    },
    suspension: {
      frontSuspension: { value: 8, min: 1, max: 11 },
      rearSuspension: { value: 7, min: 1, max: 11 },
      frontAntiRollBar: { value: 7, min: 1, max: 11 },
      rearAntiRollBar: { value: 8, min: 1, max: 11 },
      frontRideHeight: { value: 41, min: 0, max: 100 },
      rearRideHeight: { value: 57, min: 0, max: 100 },
    },
    brakes: {
      brakePressure: { value: 97, min: 50, max: 100 },
      brakeBias: { value: 58, min: 50, max: 70 },
    },
    tyres: {
      frontTyrePressure: { value: 22.7, min: 19.0, max: 25.0 },
      rearTyrePressure: { value: 21.4, min: 19.0, max: 25.0 },
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
