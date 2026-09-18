// Real pan-India administrative reference data: 28 states + 8 union
// territories, and their real districts (per general public knowledge of
// India's administrative divisions - this sandbox has no outbound internet
// access to a live authoritative feed such as the Local Government
// Directory at data.gov.in, so treat this as a good-faith static snapshot
// rather than a legally definitive source; a small number of very recently
// created/renamed/contested districts - e.g. Rajasthan's 2023 reorganisation,
// which was itself partly reversed in 2024 - may not be reflected).
//
// Sub-district (tehsil/taluk/block) names are intentionally NOT provided for
// every district: producing ~6,000 real sub-district names pan-India from
// memory, without a live dataset to verify against, would risk generating
// plausible-looking but wrong entries - exactly the "fabricated data"
// problem this project has otherwise avoided. Instead, SUB_DISTRICTS below
// covers only the districts this app actually seeds complaint/case data
// for, where the tehsil names can be stated with real confidence. For every
// other district, `subDistrict` remains a free-text field (see the Victim
// model) that a real officer fills in from local knowledge.

export const DISTRICTS_BY_STATE: Record<string, string[]> = {
  'Andhra Pradesh': [
    'Srikakulam', 'Parvathipuram Manyam', 'Vizianagaram', 'Visakhapatnam', 'Alluri Sitharama Raju',
    'Anakapalli', 'Kakinada', 'East Godavari', 'Konaseema', 'West Godavari', 'Eluru', 'NTR',
    'Krishna', 'Guntur', 'Palnadu', 'Bapatla', 'Prakasam', 'Sri Potti Sriramulu Nellore',
    'Kurnool', 'Nandyal', 'Anantapur', 'Sri Sathya Sai', 'YSR Kadapa', 'Annamayya', 'Chittoor', 'Tirupati',
  ],
  'Arunachal Pradesh': [
    'Tawang', 'West Kameng', 'East Kameng', 'Papum Pare', 'Kurung Kumey', 'Kra Daadi',
    'Lower Subansiri', 'Upper Subansiri', 'West Siang', 'East Siang', 'Siang', 'Upper Siang',
    'Lower Siang', 'Lower Dibang Valley', 'Dibang Valley', 'Lepa Rada', 'Shi Yomi', 'Anjaw',
    'Lohit', 'Namsai', 'Changlang', 'Tirap', 'Longding', 'Pakke Kessang', 'Kamle',
  ],
  Assam: [
    'Kokrajhar', 'Bongaigaon', 'Chirang', 'Dhubri', 'South Salmara-Mankachar', 'Goalpara', 'Barpeta',
    'Nalbari', 'Baksa', 'Kamrup', 'Kamrup Metropolitan', 'Darrang', 'Udalguri', 'Morigaon', 'Nagaon',
    'Hojai', 'Sonitpur', 'Biswanath', 'Lakhimpur', 'Dhemaji', 'Majuli', 'Golaghat', 'Jorhat',
    'Charaideo', 'Sivasagar', 'Dibrugarh', 'Tinsukia', 'Karbi Anglong', 'West Karbi Anglong',
    'Dima Hasao', 'Cachar', 'Karimganj', 'Hailakandi', 'Bajali', 'Tamulpur',
  ],
  Bihar: [
    'Patna', 'Nalanda', 'Bhojpur', 'Buxar', 'Rohtas', 'Kaimur', 'Gaya', 'Jehanabad', 'Arwal',
    'Aurangabad', 'Nawada', 'Vaishali', 'Saran', 'Siwan', 'Gopalganj', 'Muzaffarpur', 'Sitamarhi',
    'Sheohar', 'East Champaran', 'West Champaran', 'Madhubani', 'Darbhanga', 'Samastipur',
    'Begusarai', 'Munger', 'Lakhisarai', 'Sheikhpura', 'Khagaria', 'Bhagalpur', 'Banka', 'Purnia',
    'Katihar', 'Araria', 'Kishanganj', 'Saharsa', 'Supaul', 'Madhepura', 'Jamui',
  ],
  Chhattisgarh: [
    'Raipur', 'Balodabazar', 'Mahasamund', 'Gariaband', 'Dhamtari', 'Durg', 'Bemetara', 'Balod',
    'Rajnandgaon', 'Kabirdham', 'Bilaspur', 'Mungeli', 'Gaurela-Pendra-Marwahi', 'Janjgir-Champa',
    'Korba', 'Raigarh', 'Jashpur', 'Sarangarh-Bilaigarh', 'Sakti', 'Manendragarh-Chirmiri-Bharatpur',
    'Surguja', 'Balrampur', 'Surajpur', 'Koriya', 'Bastar', 'Kondagaon', 'Narayanpur', 'Dantewada',
    'Sukma', 'Bijapur', 'Kanker', 'Khairagarh-Chhuikhadan-Gandai', 'Mohla-Manpur-Ambagarh Chowki',
  ],
  Goa: ['North Goa', 'South Goa'],
  Gujarat: [
    'Kachchh', 'Banaskantha', 'Patan', 'Mehsana', 'Sabarkantha', 'Aravalli', 'Gandhinagar',
    'Ahmedabad', 'Surendranagar', 'Rajkot', 'Jamnagar', 'Devbhoomi Dwarka', 'Porbandar', 'Morbi',
    'Botad', 'Bhavnagar', 'Amreli', 'Junagadh', 'Gir Somnath', 'Anand', 'Kheda', 'Mahisagar',
    'Panchmahal', 'Dahod', 'Vadodara', 'Chhota Udepur', 'Narmada', 'Bharuch', 'Surat', 'Tapi',
    'Dang', 'Navsari', 'Valsad',
  ],
  Haryana: [
    'Panchkula', 'Ambala', 'Yamunanagar', 'Kurukshetra', 'Kaithal', 'Karnal', 'Panipat', 'Sonipat',
    'Jind', 'Fatehabad', 'Sirsa', 'Hisar', 'Bhiwani', 'Charkhi Dadri', 'Rohtak', 'Jhajjar',
    'Mahendragarh', 'Rewari', 'Gurugram', 'Nuh', 'Faridabad', 'Palwal',
  ],
  'Himachal Pradesh': [
    'Chamba', 'Kangra', 'Lahaul and Spiti', 'Kullu', 'Mandi', 'Hamirpur', 'Una', 'Bilaspur',
    'Solan', 'Sirmaur', 'Shimla', 'Kinnaur',
  ],
  Jharkhand: [
    'Garhwa', 'Palamu', 'Latehar', 'Chatra', 'Hazaribagh', 'Koderma', 'Giridih', 'Ramgarh',
    'Bokaro', 'Dhanbad', 'Deoghar', 'Jamtara', 'Dumka', 'Pakur', 'Godda', 'Sahibganj',
    'Saraikela Kharsawan', 'East Singhbhum', 'West Singhbhum', 'Simdega', 'Gumla', 'Lohardaga',
    'Ranchi', 'Khunti',
  ],
  Karnataka: [
    'Bagalkot', 'Ballari', 'Belagavi', 'Bengaluru Rural', 'Bengaluru Urban', 'Bidar',
    'Chamarajanagar', 'Chikballapur', 'Chikkamagaluru', 'Chitradurga', 'Dakshina Kannada',
    'Davanagere', 'Dharwad', 'Gadag', 'Hassan', 'Haveri', 'Kalaburagi', 'Kodagu', 'Kolar',
    'Koppal', 'Mandya', 'Mysuru', 'Raichur', 'Ramanagara', 'Shivamogga', 'Tumakuru', 'Udupi',
    'Uttara Kannada', 'Vijayapura', 'Yadgir', 'Vijayanagara',
  ],
  Kerala: [
    'Kasaragod', 'Kannur', 'Wayanad', 'Kozhikode', 'Malappuram', 'Palakkad', 'Thrissur',
    'Ernakulam', 'Idukki', 'Kottayam', 'Alappuzha', 'Pathanamthitta', 'Kollam', 'Thiruvananthapuram',
  ],
  'Madhya Pradesh': [
    'Bhopal', 'Sehore', 'Raisen', 'Vidisha', 'Rajgarh', 'Indore', 'Dewas', 'Dhar', 'Jhabua',
    'Alirajpur', 'Khargone', 'Barwani', 'Khandwa', 'Burhanpur', 'Ujjain', 'Ratlam', 'Mandsaur',
    'Neemuch', 'Shajapur', 'Agar Malwa', 'Gwalior', 'Datia', 'Bhind', 'Morena', 'Sheopur',
    'Shivpuri', 'Ashoknagar', 'Guna', 'Jabalpur', 'Katni', 'Narsinghpur', 'Chhindwara', 'Seoni',
    'Mandla', 'Dindori', 'Balaghat', 'Sagar', 'Damoh', 'Panna', 'Chhatarpur', 'Tikamgarh',
    'Niwari', 'Rewa', 'Satna', 'Sidhi', 'Singrauli', 'Umaria', 'Shahdol', 'Anuppur', 'Betul',
    'Harda', 'Narmadapuram', 'Pandhurna', 'Maihar',
  ],
  Maharashtra: [
    'Nandurbar', 'Dhule', 'Jalgaon', 'Buldhana', 'Akola', 'Washim', 'Amravati', 'Yavatmal',
    'Wardha', 'Nagpur', 'Bhandara', 'Gondia', 'Chandrapur', 'Gadchiroli', 'Nashik', 'Palghar',
    'Thane', 'Mumbai City', 'Mumbai Suburban', 'Raigad', 'Pune', 'Ahmednagar', 'Solapur', 'Satara',
    'Sangli', 'Kolhapur', 'Ratnagiri', 'Sindhudurg', 'Chhatrapati Sambhajinagar', 'Jalna', 'Beed',
    'Latur', 'Dharashiv', 'Nanded', 'Hingoli', 'Parbhani',
  ],
  Manipur: [
    'Bishnupur', 'Chandel', 'Churachandpur', 'Imphal East', 'Imphal West', 'Jiribam', 'Kakching',
    'Kamjong', 'Kangpokpi', 'Noney', 'Pherzawl', 'Senapati', 'Tamenglong', 'Tengnoupal', 'Thoubal', 'Ukhrul',
  ],
  Meghalaya: [
    'East Garo Hills', 'East Jaintia Hills', 'East Khasi Hills', 'North Garo Hills', 'Ri Bhoi',
    'South Garo Hills', 'South West Garo Hills', 'South West Khasi Hills', 'West Garo Hills',
    'West Jaintia Hills', 'West Khasi Hills', 'Eastern West Khasi Hills',
  ],
  Mizoram: [
    'Aizawl', 'Champhai', 'Hnahthial', 'Khawzawl', 'Kolasib', 'Lawngtlai', 'Lunglei', 'Mamit',
    'Saitual', 'Serchhip', 'Siaha',
  ],
  Nagaland: [
    'Chumoukedima', 'Dimapur', 'Kiphire', 'Kohima', 'Longleng', 'Mokokchung', 'Mon', 'Niuland',
    'Noklak', 'Peren', 'Phek', 'Shamator', 'Tuensang', 'Tseminyu', 'Wokha', 'Zunheboto',
  ],
  Odisha: [
    'Bargarh', 'Jharsuguda', 'Sambalpur', 'Debagarh', 'Sundargarh', 'Kendujhar', 'Mayurbhanj',
    'Balasore', 'Bhadrak', 'Kendrapara', 'Jagatsinghpur', 'Cuttack', 'Jajpur', 'Dhenkanal',
    'Angul', 'Nayagarh', 'Khordha', 'Puri', 'Ganjam', 'Gajapati', 'Kandhamal', 'Boudh',
    'Subarnapur', 'Bolangir', 'Nuapada', 'Kalahandi', 'Rayagada', 'Nabarangpur', 'Koraput', 'Malkangiri',
  ],
  Punjab: [
    'Amritsar', 'Tarn Taran', 'Gurdaspur', 'Pathankot', 'Hoshiarpur', 'Shahid Bhagat Singh Nagar',
    'Kapurthala', 'Jalandhar', 'Ludhiana', 'Moga', 'Firozpur', 'Fazilka', 'Sri Muktsar Sahib',
    'Faridkot', 'Bathinda', 'Mansa', 'Sangrur', 'Malerkotla', 'Barnala', 'Patiala',
    'Fatehgarh Sahib', 'Rupnagar', 'SAS Nagar',
  ],
  Rajasthan: [
    'Ganganagar', 'Hanumangarh', 'Bikaner', 'Churu', 'Jhunjhunu', 'Sikar', 'Alwar', 'Bharatpur',
    'Dholpur', 'Karauli', 'Sawai Madhopur', 'Dausa', 'Jaipur', 'Ajmer', 'Nagaur', 'Tonk', 'Bundi',
    'Kota', 'Baran', 'Jhalawar', 'Jodhpur', 'Barmer', 'Jaisalmer', 'Pali', 'Sirohi', 'Jalore',
    'Udaipur', 'Rajsamand', 'Bhilwara', 'Chittorgarh', 'Pratapgarh', 'Dungarpur', 'Banswara',
  ],
  Sikkim: ['Gangtok', 'Mangan', 'Namchi', 'Gyalshing', 'Soreng', 'Pakyong'],
  'Tamil Nadu': [
    'Chennai', 'Tiruvallur', 'Chengalpattu', 'Kanchipuram', 'Vellore', 'Ranipet', 'Tirupathur',
    'Tiruvannamalai', 'Villupuram', 'Kallakurichi', 'Cuddalore', 'Salem', 'Namakkal', 'Dharmapuri',
    'Krishnagiri', 'Erode', 'Tiruppur', 'Coimbatore', 'The Nilgiris', 'Karur', 'Tiruchirappalli',
    'Perambalur', 'Ariyalur', 'Thanjavur', 'Tiruvarur', 'Nagapattinam', 'Mayiladuthurai',
    'Pudukkottai', 'Madurai', 'Theni', 'Dindigul', 'Ramanathapuram', 'Sivaganga', 'Virudhunagar',
    'Thoothukudi', 'Tirunelveli', 'Tenkasi', 'Kanniyakumari',
  ],
  Telangana: [
    'Adilabad', 'Nirmal', 'Nizamabad', 'Kamareddy', 'Jagtial', 'Peddapalli', 'Mancherial',
    'Rajanna Sircilla', 'Karimnagar', 'Jayashankar Bhupalpally', 'Mulugu', 'Bhadradri Kothagudem',
    'Khammam', 'Warangal Urban', 'Hanumakonda', 'Mahabubabad', 'Jangaon', 'Yadadri Bhuvanagiri',
    'Medchal-Malkajgiri', 'Hyderabad', 'Rangareddy', 'Vikarabad', 'Sangareddy', 'Medak', 'Siddipet',
    'Nalgonda', 'Suryapet', 'Nagarkurnool', 'Wanaparthy', 'Jogulamba Gadwal', 'Mahabubnagar',
    'Narayanpet', 'Kumuram Bheem Asifabad',
  ],
  Tripura: [
    'West Tripura', 'Sepahijala', 'Gomati', 'South Tripura', 'Dhalai', 'Khowai', 'Unakoti', 'North Tripura',
  ],
  'Uttar Pradesh': [
    'Saharanpur', 'Shamli', 'Muzaffarnagar', 'Bijnor', 'Amroha', 'Moradabad', 'Sambhal', 'Rampur',
    'Bareilly', 'Pilibhit', 'Shahjahanpur', 'Badaun', 'Lakhimpur Kheri', 'Sitapur', 'Hardoi',
    'Unnao', 'Lucknow', 'Rae Bareli', 'Farrukhabad', 'Kannauj', 'Etawah', 'Auraiya', 'Kanpur Dehat',
    'Kanpur Nagar', 'Jalaun', 'Jhansi', 'Lalitpur', 'Hamirpur', 'Mahoba', 'Banda', 'Chitrakoot',
    'Fatehpur', 'Pratapgarh', 'Kaushambi', 'Prayagraj', 'Barabanki', 'Ayodhya', 'Ambedkar Nagar',
    'Sultanpur', 'Amethi', 'Bahraich', 'Shravasti', 'Balrampur', 'Gonda', 'Siddharthnagar',
    'Basti', 'Sant Kabir Nagar', 'Maharajganj', 'Gorakhpur', 'Kushinagar', 'Deoria', 'Azamgarh',
    'Mau', 'Ballia', 'Jaunpur', 'Ghazipur', 'Chandauli', 'Varanasi', 'Bhadohi', 'Mirzapur',
    'Sonbhadra', 'Etah', 'Kasganj', 'Mainpuri', 'Firozabad', 'Mathura', 'Agra', 'Aligarh',
    'Hathras', 'Meerut', 'Baghpat', 'Ghaziabad', 'Hapur', 'Gautam Buddha Nagar', 'Bulandshahr',
  ],
  Uttarakhand: [
    'Uttarkashi', 'Chamoli', 'Rudraprayag', 'Tehri Garhwal', 'Dehradun', 'Pauri Garhwal',
    'Pithoragarh', 'Bageshwar', 'Almora', 'Champawat', 'Nainital', 'Udham Singh Nagar', 'Haridwar',
  ],
  'West Bengal': [
    'Darjeeling', 'Kalimpong', 'Jalpaiguri', 'Alipurduar', 'Cooch Behar', 'Uttar Dinajpur',
    'Dakshin Dinajpur', 'Malda', 'Murshidabad', 'Birbhum', 'Purba Bardhaman', 'Paschim Bardhaman',
    'Nadia', 'North 24 Parganas', 'South 24 Parganas', 'Hooghly', 'Howrah', 'Kolkata',
    'Purba Medinipur', 'Paschim Medinipur', 'Jhargram', 'Bankura', 'Purulia',
  ],
  'Andaman and Nicobar Islands': ['Nicobar', 'North and Middle Andaman', 'South Andaman'],
  Chandigarh: ['Chandigarh'],
  'Dadra and Nagar Haveli and Daman and Diu': ['Dadra and Nagar Haveli', 'Daman', 'Diu'],
  Delhi: [
    'Central Delhi', 'North Delhi', 'North East Delhi', 'North West Delhi', 'East Delhi',
    'New Delhi', 'Shahdara', 'South Delhi', 'South East Delhi', 'South West Delhi', 'West Delhi',
  ],
  'Jammu and Kashmir': [
    'Kupwara', 'Bandipora', 'Baramulla', 'Srinagar', 'Ganderbal', 'Budgam', 'Pulwama', 'Shopian',
    'Anantnag', 'Kulgam', 'Jammu', 'Samba', 'Kathua', 'Udhampur', 'Reasi', 'Rajouri', 'Poonch',
    'Doda', 'Ramban', 'Kishtwar',
  ],
  Ladakh: ['Leh', 'Kargil'],
  Lakshadweep: ['Lakshadweep'],
  Puducherry: ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
};

export const STATES: string[] = Object.keys(DISTRICTS_BY_STATE).sort();

// Real sub-district (tehsil/taluk) names - populated only for districts this
// app actually seeds complaint/case data for (see prisma/seed.ts). Keyed as
// "State|District". Every other district's subDistrict stays free-text.
export const SUB_DISTRICTS: Record<string, string[]> = {
  'Bihar|Bhojpur': ['Ara Sadar', 'Piro', 'Sandesh', 'Koilwar', 'Jagdishpur', 'Shahpur'],
  'Bihar|Patna': ['Patna Sadar', 'Danapur', 'Phulwari', 'Barh', 'Masaurhi', 'Paliganj'],
  'Bihar|Gaya': ['Gaya Sadar', 'Sherghati', 'Tekari', 'Wazirganj', 'Imamganj'],
  'Uttar Pradesh|Kanpur Nagar': ['Kanpur Sadar', 'Bilhaur', 'Ghatampur', 'Bithoor'],
  'Uttar Pradesh|Lucknow': ['Lucknow Sadar', 'Malihabad', 'Mohanlalganj', 'Bakshi Ka Talab'],
  'Uttar Pradesh|Varanasi': ['Varanasi Sadar', 'Pindra', 'Cholapur'],
  'Gujarat|Dahod': ['Dahod', 'Jhalod', 'Garbada', 'Devgadh Baria', 'Limkheda'],
  'Gujarat|Ahmedabad': ['Daskroi', 'Sanand', 'Dholka', 'Viramgam', 'Detroj-Rampura'],
  'Rajasthan|Alwar': ['Alwar', 'Ramgarh', 'Tijara', 'Kishangarh Bas', 'Behror'],
  'Rajasthan|Jaipur': ['Jaipur', 'Sanganer', 'Amber', 'Bassi', 'Chomu'],
  'Madhya Pradesh|Bhopal': ['Huzur', 'Berasia'],
  'Madhya Pradesh|Indore': ['Indore', 'Depalpur', 'Sanwer', 'Mhow'],
  'Telangana|Nizamabad': ['Nizamabad', 'Bodhan', 'Armoor', 'Yellareddy'],
  'Telangana|Hyderabad': ['Secunderabad', 'Charminar', 'Musheerabad'],
  'Tamil Nadu|Madurai': ['Madurai North', 'Madurai South', 'Melur', 'Thirumangalam', 'Usilampatti'],
  'Tamil Nadu|Chennai': ['Egmore', 'Mylapore', 'Purasawalkam', 'Tondiarpet'],
  'West Bengal|Purulia': ['Purulia Sadar', 'Raghunathpur', 'Manbazar', 'Jhalda'],
  'West Bengal|Kolkata': ['Kolkata Municipal Corporation'],
  'Jharkhand|Ranchi': ['Ranchi Sadar', 'Bundu', 'Kanke', 'Namkum'],
  'Jharkhand|Dhanbad': ['Dhanbad', 'Jharia', 'Baghmara', 'Govindpur'],
  'Karnataka|Bengaluru Rural': ['Devanahalli', 'Doddaballapur', 'Hoskote', 'Nelamangala'],
  'Karnataka|Mysuru': ['Mysuru', 'Hunsur', 'Nanjangud', 'T Narasipura', 'Periyapatna'],
  'Odisha|Khordha': ['Bhubaneswar', 'Balianta', 'Banapur'],
  'Odisha|Cuttack': ['Cuttack Sadar', 'Banki', 'Athagarh', 'Niali'],
  'Maharashtra|Nagpur': ['Nagpur Urban', 'Nagpur Rural', 'Kamptee', 'Hingna', 'Katol'],
  'Maharashtra|Pune': ['Haveli', 'Mulshi', 'Maval', 'Baramati', 'Shirur'],
};

export function subDistrictsFor(state: string, district: string): string[] {
  return SUB_DISTRICTS[`${state}|${district}`] ?? [];
}
