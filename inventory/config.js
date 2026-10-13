// Fiesta Inventory config. Paste Justin's Apps Script Web app URL (ends in /exec) below.
// Leave it empty to run in DEMO mode (saves only on this phone, not to the Sheet).
window.FIESTA_CONFIG = {
  API_URL: "",
  // From Ethan's /workspace/inventory/locations_customers.md (Oct 13, 2026). Edit freely.
  SHIP_VIA_DEFAULT: "SB Delivery",
  CUSTOMERS: [
    {name:"Taste of Cuba (Issac)", ship_to:"1229 Admiral Nimitz Circle, Embarcadero Bldg 29 Map Plat 42, Dallas 75210", drop:"Map Plat 42 - Magnolia Theatre area", alert:"Past issue: wrong BIBs delivered 9/29 (18 replaced and returned to W2). Check every case label against the slip. Ask about forklift for pallets."},
    {name:"The Dock (Winter's Family)", ship_to:"1229 Admiral Nimitz Circle, Embarcadero Bldg 29 Map Plat #1", drop:"Map Plat #1 - to the dock, morning"},
    {name:"Fruteria Cano", ship_to:"1229 Admiral Nimitz Cir, Map Plat No 36, Embarcadero Bldg No 29", drop:"Map Plat 36 - across the pond at the dinosaur exhibit area stand"},
    {name:"2-5 Concessions", ship_to:"1229 Admiral Nimitz Circle, MLK 6F", drop:"MLK 6F - between the Funway and the Midway (sometimes picks up at warehouse)"},
    {name:"Katie's Cafe", ship_to:"3921 Martin Luther King Blvd, FW-29F, Dallas 75210", drop:"FW-29F"},
    {name:"Fiesta stand - Trio", ship_to:"", drop:""},
    {name:"Fiesta stand - Granny's 1", ship_to:"", drop:""},
    {name:"Fiesta stand - Granny's 2", ship_to:"", drop:""},
    {name:"Fiesta stand - Footlong", ship_to:"", drop:""},
    {name:"Fiesta stand - Limonata", ship_to:"", drop:""},
    {name:"Fiesta stand - Boba Rita", ship_to:"", drop:""},
    {name:"Fiesta warehouse (pickup)", ship_to:"928 S Haskell Ave, Dallas TX 75223", drop:"Warehouse"}
  ],
  COUNTER_NAMES: ["Mac"]
};
