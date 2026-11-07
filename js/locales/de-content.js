// German content that is data rather than UI text: task examples and skill names per category.

export const SKILLS_DE = {
  cleaning: ['Grundreinigung', 'Küche & Bad', 'Endreinigung bei Auszug', 'Öko-Putzmittel', 'Bügeln'],
  window_cleaning: ['Fenster & Rahmen', 'Balkontüren', 'Streifenfrei'],
  gardening: ['Heckenschnitt', 'Rasenpflege', 'Laub entfernen', 'Bepflanzung', 'Winterschutz', 'Eigenes Werkzeug'],
  pet_care: ['Gassi gehen', 'Katzenbetreuung', 'Große Hunde', 'Medikamente für Tiere'],
  errands: ['Einkaufen', 'Apotheke', 'Post', 'Seniorenfreundlich'],
  pickup_delivery: ['Eigenes Auto', 'Transporter (Führerschein B)', 'Fahrradkurier', 'Sperrige Gegenstände'],
  moving: ['Schwer heben', 'Tragen über Stiegen', 'Möbel zerlegen', 'Zerbrechliches verpacken', 'Transporter (Führerschein B)'],
  event_setup: ['Tische & Stühle', 'Dekoration', 'Bühne & Licht (einfach)', 'Aufräumen nach Events'],
  household: ['Möbelaufbau', 'Regale & Bilder aufhängen', 'Entrümpeln', 'Kleine Reparaturen (keine Elektrik)'],
};

export const EXAMPLES_DE = {
  cleaning: {
    title: 'Grundreinigung von Küche und Bad',
    description: 'Küche und Bad brauchen eine gründliche Reinigung: Backofen, Kühlschrank, Fliesen und die Duschwand. Putzmittel sind da, du kannst aber gerne deine eigenen mitbringen.',
    requirements: 'Erfahrung mit Grundreinigung\nEigene Handschuhe', safetyNotes: 'Bitte an der Seitentür läuten.',
    budgetMin: 70, budgetMax: 100, hours: 4,
  },
  window_cleaning: {
    title: '6 Fenster und eine Balkontür putzen',
    description: 'Sechs Doppelfenster (alte Wiener Kastenfenster) und eine Balkontür, innen und außen. Leiter und Tücher sind vorhanden.',
    requirements: 'Sicher auf einer kleinen Leiter', safetyNotes: 'Die Fenster gehen nach innen auf, keine Arbeit am Außensims nötig.',
    budgetMin: 60, budgetMax: 90, hours: 3,
  },
  gardening: {
    title: 'Laub entfernen und Garten winterfest machen',
    description: 'Kleiner Garten (ca. 150 m²): Laub von Rasen und Beeten entfernen und die Rosen für den Winter abdecken. Grünschnittsäcke sind vorhanden.',
    requirements: 'Eigener Rechen oder Laubbläser\nWeiß, wie man Rosen winterfest macht', safetyNotes: 'Unser Hund bleibt während der Arbeit drinnen.',
    budgetMin: 80, budgetMax: 120, hours: 4,
  },
  pet_care: {
    title: 'Abendrunden mit einer freundlichen Beagle-Hündin',
    description: 'Ich suche jemanden, der mit Luna (4 Jahre, Beagle) an Wochentagen abends ca. 45 Minuten Gassi geht, wenn ich länger arbeite. Am Anfang zieht sie ein bisschen.',
    requirements: 'Erfahrung mit Hunden', safetyNotes: 'Schlüsselübergabe zuerst persönlich.',
    budgetMin: 60, budgetMax: 80, hours: 4,
  },
  errands: {
    title: 'Wöchentlicher Einkauf',
    description: 'Einmal pro Woche einen Einkauf nach Liste erledigen (ca. 2 Taschen) und in meine Wohnung im 2. Stock bringen. Das Geld für den Einkauf bekommst du vorab.',
    requirements: 'Kassenbon aufheben', safetyNotes: 'Im Haus gibt es keinen Lift.',
    budgetMin: 20, budgetMax: 30, hours: 1.5,
  },
  pickup_delivery: {
    title: 'Gebrauchtes Fahrrad abholen',
    description: 'Ich habe ein Fahrrad von jemandem in einem anderen Bezirk gekauft. Bitte abholen (schon bezahlt) und zu mir bringen. Es passt mit umgeklappten Sitzen ins Auto oder kann hergefahren werden.',
    requirements: 'Auto, oder du fährst mit dem Rad quer durch die Stadt', safetyNotes: 'Der Verkäufer möchte 10 Minuten vorher über den Chat in der App Bescheid bekommen.',
    budgetMin: 25, budgetMax: 40, hours: 1.5,
  },
  moving: {
    title: 'Hilfe beim Kartons-Tragen in die neue Wohnung',
    description: 'Ca. 20 Kartons und ein paar kleine Möbel müssen vom Transporter in eine Wohnung im 2. Stock. Der Transporter ist schon gebucht.',
    requirements: 'Kann schwere Kartons über Stiegen tragen', safetyNotes: 'Bitte festes Schuhwerk, das Stiegenhaus ist eng.',
    budgetMin: 50, budgetMax: 80, hours: 2.5,
  },
  event_setup: {
    title: 'Geburtstagsfeier auf- und abbauen',
    description: 'Tische, Stühle und einfache Deko in einem gemieteten Raum vor einer Geburtstagsfeier aufbauen und danach beim Abbau helfen.',
    requirements: '', safetyNotes: '',
    budgetMin: 60, budgetMax: 90, hours: 4,
  },
  household: {
    title: 'Bett und Kommode aufbauen',
    description: 'Ein Bett (160 cm) und eine Kommode zum Selbstaufbauen. Alle Teile und Anleitungen sind da, einfaches Werkzeug habe ich.',
    requirements: 'Erfahrung mit Möbelaufbau', safetyNotes: '',
    budgetMin: 50, budgetMax: 80, hours: 3,
  },
};
