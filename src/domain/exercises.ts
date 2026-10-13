import type { ExerciseId, WorkoutType } from './types'

export interface ExerciseInfo {
  id: ExerciseId
  name: string
  workout: WorkoutType
  muscles: { primary: string[]; secondary: string[] }
  equipment: string
  /**
   * Dumbbells moved per repetition (one side for unilateral work). Used only for
   * the external-load volume figure; logged weight is always ONE dumbbell.
   * 0 = bodyweight/timed (excluded from load volume).
   */
  dumbbells: 0 | 1 | 2
  start: string
  end: string
  direction: string
  cues: [string, string, string]
  mistakes: string[]
  breathing: string
  /** Short hint shown above the set form. */
  loadHint: string
}

export const EXERCISES: Record<ExerciseId, ExerciseInfo> = {
  'goblet-squat': {
    id: 'goblet-squat',
    name: 'Przysiad goblet',
    workout: 'A',
    muscles: { primary: ['czworogłowe uda', 'pośladkowe wielkie'], secondary: ['przywodziciele', 'prostowniki grzbietu', 'mięśnie brzucha'] },
    equipment: 'jeden hantel trzymany pionowo przy klatce',
    dumbbells: 1,
    start: 'Stopy nieco szerzej niż biodra, palce lekko na zewnątrz. Hantel trzymany pionowo oburącz pod brodą, łokcie skierowane w dół.',
    end: 'Biodra opuszczone co najmniej do wysokości kolan (lub tak nisko, jak pozwala neutralny kręgosłup), kolana nad palcami stóp, tułów lekko pochylony, pięty na ziemi.',
    direction: 'W dół: jednocześnie ugnij biodra i kolana, siadając „między nogi”. W górę: wypchnij podłoże całą stopą do pełnego wyprostu.',
    cues: ['Kolana prowadź w linii palców stóp — nie pozwól im uciekać do środka.', 'Ciężar na całej stopie, pięty przyklejone do podłoża.', 'Hantel blisko klatki, klatka piersiowa „wysoko”.'],
    mistakes: ['Odrywanie pięt i przenoszenie ciężaru na palce.', 'Koślawienie kolan w fazie wstawania.', 'Zaokrąglanie dolnego odcinka pleców na dole ruchu.', 'Odsuwanie hantla od tułowia.'],
    breathing: 'Wdech i napięcie brzucha przed zejściem, zatrzymaj powietrze na dole, wydech podczas wstawania lub po przejściu najtrudniejszego punktu.',
    loadHint: 'Ciężar = masa jednego hantla.',
  },
  'flat-db-press': {
    id: 'flat-db-press',
    name: 'Wyciskanie hantli na płasko',
    workout: 'A',
    muscles: { primary: ['piersiowy większy', 'triceps'], secondary: ['przedni akton naramiennego'] },
    equipment: 'dwa hantle, ławka płasko',
    dumbbells: 2,
    start: 'Leżysz na ławce, stopy stabilnie na podłodze, łopatki ściągnięte i obniżone. Hantle nad klatką, ręce prawie wyprostowane.',
    end: 'Hantle opuszczone do boków klatki, łokcie ok. 45–60° od tułowia, przedramiona pionowo, lekkie rozciągnięcie klatki.',
    direction: 'W dół: kontrolowane opuszczanie po lekkim łuku do boków klatki. W górę: wypchnij hantle nad środek klatki.',
    cues: ['Łopatki ściągnięte i „schowane do kieszeni” przez całą serię.', 'Przedramiona pionowo — nadgarstek nad łokciem.', 'Stopy wbite w podłogę, pośladki na ławce.'],
    mistakes: ['Łokcie rozłożone na 90° od tułowia (obciążenie barków).', 'Odbijanie hantli od klatki i brak kontroli w fazie opuszczania.', 'Odrywanie pośladków od ławki.', 'Zginanie nadgarstków do tyłu.'],
    breathing: 'Wdech podczas opuszczania, wydech podczas wyciskania.',
    loadHint: 'Ciężar = masa jednego hantla.',
  },
  'one-arm-row': {
    id: 'one-arm-row',
    name: 'Wiosłowanie jednorącz',
    workout: 'A',
    muscles: { primary: ['najszerszy grzbietu', 'mięśnie środkowej części grzbietu (równoległoboczne, czworoboczny)'], secondary: ['tylny akton naramiennego', 'biceps'] },
    equipment: 'jeden hantel, ławka płasko',
    dumbbells: 1,
    start: 'Kolano i dłoń tej samej strony na ławce, druga noga na podłodze. Plecy płasko, prawie równolegle do podłogi. Ręka z hantlem wyprostowana pod barkiem.',
    end: 'Hantel przyciągnięty w kierunku biodra, łokieć blisko tułowia i nieco powyżej linii pleców, łopatka ściągnięta.',
    direction: 'W górę: prowadź łokieć do tyłu i w stronę biodra (łuk). W dół: kontrolowany powrót do pełnego wyprostu ręki z lekkim wysunięciem łopatki.',
    cues: ['Myśl o ciągnięciu łokciem, nie dłonią.', 'Tułów nieruchomy — bez rotacji i szarpania.', 'Szyja w przedłużeniu kręgosłupa, wzrok w podłogę.'],
    mistakes: ['Skręcanie tułowia, żeby „dorzucić” ciężar.', 'Ciągnięcie hantla do barku zamiast do biodra.', 'Zaokrąglone plecy.', 'Skrócony zakres — brak pełnego wyprostu na dole.'],
    breathing: 'Wydech podczas przyciągania, wdech podczas opuszczania.',
    loadHint: 'Zapisz powtórzenia osobno dla lewej i prawej strony. Ciężar = masa hantla.',
  },
  'romanian-deadlift': {
    id: 'romanian-deadlift',
    name: 'Martwy ciąg rumuński',
    workout: 'A',
    muscles: { primary: ['dwugłowe uda (tylna taśma)', 'pośladkowe wielkie'], secondary: ['prostowniki grzbietu', 'przedramiona (chwyt)'] },
    equipment: 'dwa hantle',
    dumbbells: 2,
    start: 'Stoisz prosto, stopy na szerokość bioder, hantle przed udami, kolana lekko ugięte, łopatki ściągnięte.',
    end: 'Biodra cofnięte maksymalnie do tyłu, tułów pochylony, plecy neutralne, hantle blisko nóg na wysokości połowy goleni (lub do pierwszego napięcia tyłu ud bez zaokrąglenia pleców).',
    direction: 'W dół: wypchnij biodra do tyłu, hantle suną po udach. W górę: wepchnij biodra do przodu do pełnego wyprostu, nie przeprostowując lędźwi.',
    cues: ['Ruch z bioder (zawias), kolana tylko lekko ugięte i stałe.', 'Hantle cały czas blisko nóg.', 'Plecy neutralne — klatka do przodu, łopatki ściągnięte.'],
    mistakes: ['Zaokrąglanie pleców w dolnej fazie.', 'Zamiana ruchu w przysiad (za duże ugięcie kolan).', 'Odsuwanie hantli od nóg.', 'Przeprost lędźwiowy na górze.'],
    breathing: 'Wdech i napięcie brzucha na górze, opuszczanie na zatrzymanym powietrzu lub z powolnym wydechem, wydech po powrocie.',
    loadHint: 'Ciężar = masa jednego hantla.',
  },
  'lateral-raise': {
    id: 'lateral-raise',
    name: 'Unoszenie hantli bokiem',
    workout: 'A',
    muscles: { primary: ['boczny akton naramiennego'], secondary: ['czworoboczny (górna część)', 'nadgrzebieniowy'] },
    equipment: 'dwa lekkie hantle',
    dumbbells: 2,
    start: 'Stoisz prosto, hantle po bokach ud, łokcie lekko ugięte, barki obniżone.',
    end: 'Ramiona uniesione bokiem do wysokości barków (ok. poziomu), łokcie lekko ugięte, łokieć na wysokości dłoni lub minimalnie wyżej.',
    direction: 'W górę: unoś bokiem po łuku, lekko przed linią tułowia. W dół: powoli wróć do boków.',
    cues: ['Prowadź ruch łokciami, nie dłońmi.', 'Barki z dala od uszu — nie unoś ich.', 'Kontrolowane opuszczanie ok. 2–3 s.'],
    mistakes: ['Bujanie tułowiem i zarzucanie ciężaru.', 'Unoszenie barków (przejmuje czworoboczny).', 'Uniesienie dłoni wyżej niż łokcie i rotacja „wylewania z dzbanka”.', 'Zbyt duży ciężar kosztem zakresu.'],
    breathing: 'Wydech podczas unoszenia, wdech podczas opuszczania.',
    loadHint: 'Ciężar = masa jednego hantla.',
  },
  plank: {
    id: 'plank',
    name: 'Plank',
    workout: 'A',
    muscles: { primary: ['mięsień prosty brzucha', 'poprzeczny brzucha'], secondary: ['skośne brzucha', 'pośladkowe', 'mięśnie obręczy barkowej'] },
    equipment: 'mata lub podłoga',
    dumbbells: 0,
    start: 'Ustawienie: przedramiona na podłodze, łokcie pod barkami, kolana na podłodze, napięty brzuch i pośladki.',
    end: 'Pozycja utrzymania: kolana uniesione, ciało w jednej linii od głowy przez biodra do pięt, miednica lekko podwinięta.',
    direction: 'Unieś kolana, utrzymując prostą linię ciała. Trzymaj pozycję przez zadany czas — bez ruchu bioder.',
    cues: ['Łokcie dokładnie pod barkami, odpychaj podłogę przedramionami.', 'Napnij pośladki i podwiń lekko miednicę.', 'Głowa w przedłużeniu tułowia, wzrok w podłogę.'],
    mistakes: ['Opadające biodra i wygięcie lędźwi.', 'Biodra zbyt wysoko („daszek”).', 'Wstrzymywanie oddechu.', 'Zapadanie się między łopatkami.'],
    breathing: 'Oddychaj spokojnie i płytko „do boków” żeber, nie tracąc napięcia brzucha. Nie wstrzymuj oddechu.',
    loadHint: 'Zapisz czas w sekundach.',
  },
  'incline-db-press': {
    id: 'incline-db-press',
    name: 'Wyciskanie hantli na skosie',
    workout: 'B',
    muscles: { primary: ['piersiowy większy (część obojczykowa)', 'przedni akton naramiennego'], secondary: ['triceps'] },
    equipment: 'dwa hantle, ławka ustawiona na ok. 30°',
    dumbbells: 2,
    start: 'Oparcie ławki ok. 30° (maksymalnie 45°). Plecy i głowa na oparciu, łopatki ściągnięte, stopy na podłodze. Hantle wyprostowane nad górną częścią klatki.',
    end: 'Hantle opuszczone do boków górnej części klatki, łokcie ok. 45–60° od tułowia, przedramiona pionowo.',
    direction: 'W dół: kontrolowane opuszczanie do górnej klatki. W górę: wypchnij hantle pionowo nad barki/górną klatkę.',
    cues: ['Kąt oparcia ok. 30° — wyższy przenosi pracę na barki.', 'Łopatki ściągnięte, klatka „wysoko”.', 'Nadgarstki proste, przedramiona pionowo.'],
    mistakes: ['Zbyt stromy kąt ławki.', 'Odrywanie łopatek i wypychanie barków do przodu na górze.', 'Odbijanie ciężaru w dolnej fazie.', 'Nadmierne wygięcie lędźwi.'],
    breathing: 'Wdech podczas opuszczania, wydech podczas wyciskania.',
    loadHint: 'Ciężar = masa jednego hantla.',
  },
  'reverse-lunge': {
    id: 'reverse-lunge',
    name: 'Wykroki w tył',
    workout: 'B',
    muscles: { primary: ['czworogłowe uda', 'pośladkowe wielkie'], secondary: ['przywodziciele', 'dwugłowe uda', 'mięśnie stabilizujące biodro'] },
    equipment: 'dwa hantle trzymane wzdłuż tułowia',
    dumbbells: 2,
    start: 'Stoisz prosto, stopy na szerokość bioder, hantle po bokach.',
    end: 'Jedna noga wykonała krok w tył, kolano tylnej nogi tuż nad podłogą, przednia goleń niemal pionowo, tułów lekko pochylony.',
    direction: 'W dół: krok w tył i kontrolowane opuszczenie bioder pionowo w dół. W górę: odepchnij się przednią nogą (cała stopa) i dostaw tylną nogę.',
    cues: ['Ciężar głównie na przedniej nodze, na całej stopie.', 'Przednie kolano w linii palców stóp.', 'Krok na tyle długi, by przednia goleń była prawie pionowa.'],
    mistakes: ['Uderzanie kolanem o podłogę.', 'Koślawienie przedniego kolana.', 'Zbyt krótki krok i wyjście na palce przedniej stopy.', 'Utrata równowagi przez ustawienie stóp „na jednej linii” — zachowaj szerokość bioder.'],
    breathing: 'Wdech podczas opuszczania, wydech podczas powrotu do stania.',
    loadHint: 'Zapisz powtórzenia osobno dla lewej i prawej nogi. Ciężar = masa jednego hantla.',
  },
  'chest-supported-row': {
    id: 'chest-supported-row',
    name: 'Wiosłowanie z podparciem',
    workout: 'B',
    muscles: { primary: ['najszerszy grzbietu', 'równoległoboczne', 'czworoboczny (środkowa część)'], secondary: ['tylny akton naramiennego', 'biceps'] },
    equipment: 'dwa hantle, ławka ustawiona na ok. 30–45°',
    dumbbells: 2,
    start: 'Leżysz przodem na skośnej ławce, klatka oparta o oparcie, stopy na podłodze. Ręce z hantlami zwisają pionowo pod barkami.',
    end: 'Hantle przyciągnięte do dolnych żeber, łokcie za linią tułowia, łopatki ściągnięte.',
    direction: 'W górę: ciągnij łokcie do tyłu i w górę. W dół: powoli wyprostuj ręce, pozwalając łopatkom lekko się rozsunąć.',
    cues: ['Klatka cały czas przyklejona do oparcia.', 'Ruch rozpoczynaj ściągnięciem łopatek.', 'Zatrzymaj na chwilę w górnej pozycji.'],
    mistakes: ['Odrywanie klatki od ławki i bujanie.', 'Unoszenie barków do uszu.', 'Wyciąganie szyi do przodu.', 'Niepełny wyprost na dole.'],
    breathing: 'Wydech podczas przyciągania, wdech podczas opuszczania. Oparcie może ograniczać oddech — oddychaj spokojnie.',
    loadHint: 'Ciężar = masa jednego hantla.',
  },
  'db-overhead-press': {
    id: 'db-overhead-press',
    name: 'Wyciskanie hantli nad głowę',
    workout: 'B',
    muscles: { primary: ['naramienne (przedni i boczny akton)', 'triceps'], secondary: ['górna część czworobocznego', 'mięśnie brzucha (stabilizacja)'] },
    equipment: 'dwa hantle (na stojąco lub siedząc na ławce z pionowym oparciem)',
    dumbbells: 2,
    start: 'Hantle na wysokości barków, łokcie lekko przed tułowiem i pod nadgarstkami, brzuch i pośladki napięte.',
    end: 'Ręce wyprostowane nad głową, hantle nad barkami, głowa „przechodzi” lekko do przodu pod rękami.',
    direction: 'W górę: wypchnij hantle pionowo w górę. W dół: kontrolowany powrót do wysokości barków.',
    cues: ['Żebra w dół — nie wyginaj lędźwi do tyłu.', 'Nadgarstki nad łokciami przez cały ruch.', 'Pełny wyprost na górze bez unoszenia barków do uszu.'],
    mistakes: ['Przeprost w odcinku lędźwiowym.', 'Wypychanie hantli przed siebie zamiast w górę.', 'Pomaganie sobie nogami (to już nie wyciskanie).', 'Skrócony zakres na dole.'],
    breathing: 'Wdech i napięcie brzucha na dole, wydech podczas wyciskania lub na górze.',
    loadHint: 'Ciężar = masa jednego hantla.',
  },
  'db-hip-thrust': {
    id: 'db-hip-thrust',
    name: 'Hip thrust z hantlem',
    workout: 'B',
    muscles: { primary: ['pośladkowe wielkie'], secondary: ['dwugłowe uda', 'czworogłowe uda', 'prostowniki grzbietu'] },
    equipment: 'jeden hantel położony na biodrach, ławka płasko',
    dumbbells: 1,
    start: 'Dolne części łopatek oparte o krawędź ławki, stopy na podłodze na szerokość bioder, hantel na kościach biodrowych przytrzymywany dłońmi. Biodra opuszczone.',
    end: 'Biodra uniesione do linii barki–biodra–kolana, goleń pionowo, broda lekko przyciągnięta, pośladki maksymalnie napięte.',
    direction: 'W górę: wypchnij biodra pionowo, rotując tułów wokół krawędzi ławki. W dół: kontrolowane opuszczenie bioder.',
    cues: ['Na górze goleń pionowo — dobierz odległość stóp.', 'Broda lekko przy klatce, żebra w dół — ruch z bioder, nie z lędźwi.', 'Pauza 1 s na górze z napiętymi pośladkami.'],
    mistakes: ['Przeprost lędźwi zamiast wyprostu bioder.', 'Stopy za daleko (praca tyłu ud) lub za blisko (praca czworogłowych).', 'Kolana uciekające do środka.', 'Zsuwanie się pleców po ławce.'],
    breathing: 'Wdech na dole, wydech podczas wypychania bioder w górę.',
    loadHint: 'Ciężar = masa jednego hantla (użyj ręcznika lub podkładki pod hantel).',
  },
  'db-biceps-curl': {
    id: 'db-biceps-curl',
    name: 'Uginanie ramion na biceps',
    workout: 'B',
    muscles: { primary: ['biceps ramienia', 'ramienny'], secondary: ['ramienno-promieniowy'] },
    equipment: 'dwa hantle',
    dumbbells: 2,
    start: 'Stoisz prosto, ręce wyprostowane wzdłuż tułowia, dłonie skierowane do przodu (supinacja), łokcie przy bokach.',
    end: 'Przedramię uniesione do pełnego zgięcia łokcia, łokieć nadal przy tułowiu, hantel na wysokości barku.',
    direction: 'W górę: zginaj tylko w stawie łokciowym. W dół: powoli do pełnego wyprostu.',
    cues: ['Łokcie nieruchomo przy tułowiu.', 'Tułów stabilny — bez bujania.', 'Pełny zakres i wolne opuszczanie (2–3 s).'],
    mistakes: ['Bujanie tułowiem i zarzucanie hantli.', 'Wysuwanie łokci do przodu na górze.', 'Niepełny wyprost na dole.', 'Zginanie nadgarstków.'],
    breathing: 'Wydech podczas uginania, wdech podczas opuszczania.',
    loadHint: 'Ciężar = masa jednego hantla.',
  },
}

export const EXERCISE_IDS = Object.keys(EXERCISES) as ExerciseId[]

export function exerciseName(id: ExerciseId): string {
  return EXERCISES[id]?.name ?? id
}
