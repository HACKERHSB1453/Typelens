/**
 * Common English words used to build weak-spot practice text. Compiled for TypeLens (a plain list of
 * everyday words, no third-party corpus). Chosen for variety of letter pairs and triples: th, ing, tion,
 * ould, ight, str, ch, sh, ph, qu, ck, ea, ou, oo, ie, ei, and so on.
 */
const RAW = `
the of and to in is you that it he was for on are as with his they at be this from have or by one had not but what all were when we there can
an your which their said if do will each about how up out them then she many some so these would other into has more her two like him see time
could no make than first been its who now people my made over did down only way find use may water long little very after words called just where
most know get through back much before go good new write our used me man too any day same right look think also around another came come work three
word must because does part even place well such here take why help put different away again off went old number great tell men say small every found
still between name should home big give air line set own under read last never us left end along while might next sound below saw something thought
both few those always looked show large often together asked house don't world going want school important until form food keep children feet land
side without boy once animal life enough took sometimes four head above kind began almost live page got earth need far hand high year mother light
country father let night picture being study second soon story since white ever paper hard near sentence better best across during today however
sure knew try told young sun thing whole hear example heard several change answer room sea against top turned learn point city play toward five using
himself usually money seen didn't car morning added friend easy began friends idea fish mountain north once base hear horse cut sure watch color face
wood main enough plain girl usual young ready above ever red list though feel talk bird soon body dog family direct pose leave song measure state
product black short numeral class wind question happen complete ship area half rock order fire south problem piece told knew pass farm top whole
king size heard best hour better true during hundred am remember step early hold west ground interest reach fast five sing listen six table travel
less morning ten simple several vowel toward war lay against pattern slow center love person money serve appear road map rain rule govern pull cold
notice voice unit power town fine certain fly fall lead cry dark machine note wait plan figure star box noun field rest correct able pound done
beauty drive stood contain front teach week final gave green oh quick develop ocean warm free minute strong special mind behind clear tail produce
fact street inch multiply nothing course stay wheel full force blue object decide surface deep moon island foot system busy test record boat common
gold possible plane stead dry wonder laugh thousand ago ran check game shape equate hot miss brought heat snow tire bring yes distant fill east paint
language among grand ball yet wave drop heart present heavy dance engine position arm wide sail material fraction forest sit race window store summer
train sleep prove lone leg exercise wall catch mount wish sky board joy winter sat written wild instrument kept glass grass cow job edge sign visit
past soft fun bright gas weather month million bear finish happy hope flower clothe strange gone jump baby eight village meet root buy raise solve
metal whether push seven paragraph third shall held hair describe cook floor either result burn hill safe cat century consider type law bit coast copy
phrase silent tall sand soil roll temperature finger industry value fight lie beat excite natural view sense ear else quite broke case middle kill
son lake moment scale loud spring observe child straight consonant nation dictionary milk speed method organ pay age section dress cloud surprise
quiet stone tiny climb cool design poor lot experiment bottom key iron single stick flat twenty skin smile crease hole trade melody trip office
receive row mouth exact symbol die least trouble shout except wrote seed tone join suggest clean break lady yard rise bad blow oil blood touch grew
cent mix team wire cost lost brown wear garden equal sent choose fell fit flow fair bank collect save control decimal gentle woman captain practice
separate difficult doctor please protect noon whose locate ring character insect caught period indicate radio spoke atom human history effect
electric expect crop modern element hit student corner party supply bone rail imagine provide agree thus capital won chair danger fruit rich thick
soldier process operate guess necessary sharp wing create neighbor wash bat rather crowd corn compare poem string bell depend meat rub tube famous
dollar stream fear sight thin triangle planet hurry chief colony clock mine tie enter major fresh search send yellow gun allow print dead spot desert
suit current lift rose continue block chart hat sell success company subtract event particular deal swim term opposite wife shoe shoulder spread
arrange camp invent cotton born determine quart nine truck noise level chance gather shop stretch throw shine property column molecule select wrong
gray repeat require broad prepare salt nose plural anger claim continent oxygen sugar death pretty skill women season solution magnet silver thank
branch match suffix especially fig afraid huge sister steel discuss forward similar guide experience score apple bought led pitch coat mass card band
rope slip win dream evening condition feed tool total basic smell valley nor double seat arrive master track parent shore division sheet substance
favor connect post spend chord fat glad original share station dad bread charge proper bar offer segment slave duck instant market degree populate
chick dear enemy reply drink occur support speech nature range steam motion path liquid log meant quotient teeth shell neck thinking testing running
walking playing morning building painting nothing anything everything something beginning evening feeling ceiling knowledge through thought enough
although brought caught daughter straight weight eight height flight fright bright sight might tight fight right night light delight quick quiz
question quality quarter square require equal quote squeeze jazz jump job just joke judge journey joint knife knee knock know known knot lamb comb
climb debt doubt island listen castle whistle wrap wrist write wrong gnaw sign foreign design resign phone photo phrase physical elephant alphabet
graph telephone nation action station relation education attention condition position question section direction collection connection protection
election selection reflection perfection production instruction construction description prescription information organization communication
`;

export const PRACTICE_WORDS: readonly string[] = [...new Set(RAW.split(/\s+/).map((w) => w.toLowerCase()).filter((w) => /^[a-z]+$/.test(w)))];
