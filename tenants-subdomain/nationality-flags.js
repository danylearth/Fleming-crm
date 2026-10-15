// Decorative nationality flags. SVG assets: flag-icons (MIT), see flags/LICENSE.
const nationalityFlagCodes = {
 Afghan:'af',Albanian:'al',Algerian:'dz',American:'us',Andorran:'ad',Angolan:'ao',Antiguan:'ag',Argentine:'ar',Armenian:'am',Australian:'au',
 Austrian:'at',Azerbaijani:'az',Bahamian:'bs',Bahraini:'bh',Bangladeshi:'bd',Barbadian:'bb',Belarusian:'by',Belgian:'be',Belizean:'bz',Beninese:'bj',
 Bhutanese:'bt',Bolivian:'bo',Bosnian:'ba',Botswanan:'bw',Brazilian:'br',British:'gb',Bruneian:'bn',Bulgarian:'bg',Burkinabe:'bf',Burmese:'mm',
 Burundian:'bi',Cambodian:'kh',Cameroonian:'cm',Canadian:'ca','Cape Verdean':'cv','Central African':'cf',Chadian:'td',Chilean:'cl',Chinese:'cn',Colombian:'co',
 Comorian:'km',Congolese:'cg cd','Costa Rican':'cr',Croatian:'hr',Cuban:'cu',Cypriot:'cy',Czech:'cz',Danish:'dk',Djiboutian:'dj',Dominican:'dm do',
 Dutch:'nl','East Timorese':'tl',Ecuadorean:'ec',Egyptian:'eg',Emirati:'ae',English:'gb-eng','Equatorial Guinean':'gq',Eritrean:'er',Estonian:'ee',Ethiopian:'et',
 Fijian:'fj',Filipino:'ph',Finnish:'fi',French:'fr',Gabonese:'ga',Gambian:'gm',Georgian:'ge',German:'de',Ghanaian:'gh',Greek:'gr',
 Grenadian:'gd',Guatemalan:'gt',Guinean:'gn',Guyanese:'gy',Haitian:'ht',Honduran:'hn',Hungarian:'hu',Icelandic:'is',Indian:'in',Indonesian:'id',
 Iranian:'ir',Iraqi:'iq',Irish:'ie',Israeli:'il',Italian:'it',Ivorian:'ci',Jamaican:'jm',Japanese:'jp',Jordanian:'jo',Kazakh:'kz',
 Kenyan:'ke',Kiribati:'ki',Kuwaiti:'kw',Kyrgyz:'kg',Lao:'la',Latvian:'lv',Lebanese:'lb',Liberian:'lr',Libyan:'ly',Liechtenstein:'li',
 Lithuanian:'lt',Luxembourgish:'lu',Macedonian:'mk',Malagasy:'mg',Malawian:'mw',Malaysian:'my',Maldivian:'mv',Malian:'ml',Maltese:'mt',Marshallese:'mh',
 Mauritanian:'mr',Mauritian:'mu',Mexican:'mx',Micronesian:'fm',Moldovan:'md',Monacan:'mc',Mongolian:'mn',Montenegrin:'me',Moroccan:'ma',Mozambican:'mz',
 Namibian:'na',Nauruan:'nr',Nepalese:'np','New Zealand':'nz',Nicaraguan:'ni',Nigerian:'ng',Nigerien:'ne','North Korean':'kp','Northern Irish':'gb',Norwegian:'no',
 Omani:'om',Pakistani:'pk',Palauan:'pw',Palestinian:'ps',Panamanian:'pa','Papua New Guinean':'pg',Paraguayan:'py',Peruvian:'pe',Polish:'pl',Portuguese:'pt',
 Qatari:'qa',Romanian:'ro',Russian:'ru',Rwandan:'rw','Saint Lucian':'lc',Salvadorean:'sv',Samoan:'ws','Saudi Arabian':'sa',Scottish:'gb-sct',Senegalese:'sn',
 Serbian:'rs',Seychellois:'sc','Sierra Leonean':'sl',Singaporean:'sg',Slovak:'sk',Slovenian:'si','Solomon Islander':'sb',Somali:'so','South African':'za','South Korean':'kr',
 'South Sudanese':'ss',Spanish:'es','Sri Lankan':'lk',Sudanese:'sd',Surinamese:'sr',Swazi:'sz',Swedish:'se',Swiss:'ch',Syrian:'sy',Taiwanese:'tw',
 Tajik:'tj',Tanzanian:'tz',Thai:'th',Togolese:'tg',Tongan:'to',Trinidadian:'tt',Tunisian:'tn',Turkish:'tr',Turkmen:'tm',Tuvaluan:'tv',
 Ugandan:'ug',Ukrainian:'ua',Uruguayan:'uy',Uzbek:'uz',Vanuatuan:'vu',Venezuelan:'ve',Vietnamese:'vn',Welsh:'gb-wls',Yemeni:'ye',Zambian:'zm',Zimbabwean:'zw'
};
function appendNationalityFlags(target, nationality) {
 const codes=nationalityFlagCodes[nationality];if(!codes)return;
 const flags=document.createElement('span');flags.className='nationality-flags';flags.setAttribute('aria-hidden','true');
 for(const code of codes.split(' ')){const image=document.createElement('img');image.src='/flags/'+code+'.svg';image.alt='';image.width=24;image.height=18;image.className='nationality-flag';flags.appendChild(image);}
 target.classList.add('nationality-option');target.appendChild(flags);
}
