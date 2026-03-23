type ManualDocumentRow = {
  serviceName: string;
  documents: string[];
  textFields: string[];
};

function splitItems(value: string) {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

const RAW_DOCUMENT_ROWS: Array<[string, string, string]> = [
  ["Aadhaar Address Update", "Aadhaar Back Photo|Aadhaar Front Photo|Address Proof", "Whatsapp Number"],
  ["Aadhaar Deactivation", "Aadhaar Back Photo|Aadhaar Front Photo", "Whatsapp Number"],
  ["Aadhaar NPCI Link", "Aadhaar Card Self-Attested (Front)|Aadhaar Card Self-Attested (Back)|Passport Photo|Bank Passbook Front Page", "State Name|Whatsapp Number"],
  ["Aadhaar PAN Link", "", "Whatsapp Number|Aadhaar Number|PAN Number|Aadhaar Linked Phone Number"],
  ["Aadhaar PVC Card", "", "Whatsapp Number|Aadhaar Number|Aadhaar Linked Phone Number"],
  ["Aadhaar Seeding With Bank Account", "Aadhaar Card Self-Attested (Front)|Aadhaar Card Self-Attested (Back)|Bank Passbook Front Page", "Whatsapp Number"],
  ["ABHA", "", "Aadhaar Number|Aadhaar Linked Phone Number|Whatsapp Number"],
  ["Affidavit Creation", "", "Whatsapp Number"],
  ["APAAR ID", "Aadhaar Back Photo|Aadhaar Front Photo", "Whatsapp Number|Registration Number|Year of Admission|Institution Name"],
  ["Atal Pension Yojana", "Aadhaar Back Photo|Aadhaar Front Photo|Bank Passbook Front Page|PAN Card", "Whatsapp Number|Nominee Phone No|Nominee Relation|Nominee Name|DOB|Marital Status"],
  ["Ayushman", "Aadhaar Back Photo|Aadhaar Front Photo|Live Current Photo", "Whatsapp Number|Caste"],
  ["Caste Certificate Haryana", "Family Card", "Whatsapp Number|Aadhaar Linked Phone Number"],
  ["Caste Certificate Maharashtra", "Aadhaar Back Photo|Aadhaar Front Photo|Passport Photo|Signature on White Paper|Caste Certificate (Parents/Siblings)|School Leaving Cert (Showing Caste)", "Whatsapp Number"],
  ["Color Coded Fuel Sticker", "Rear Laser Number|Front Laser Number|Rear Number Plate|Front Number Plate|RC Photo", "Whatsapp Number|Email ID|Aadhaar Linked Phone Number"],
  ["Cyber Crime Complaint", "Incident Proof", "Whatsapp Number"],
  ["Divyangjan Railway Card", "Aadhaar Front Photo|Aadhaar Back Photo|Passport Photo|Disability Proof|DOB Proof (Voter/PAN)", "Whatsapp Number|State Name|Nearest Railway Station"],
  ["DL Address Change", "Aadhaar Card Self-Attested (Back)|Aadhaar Card Self-Attested (Front)|Driving License Self-Attested (Back)|Driving License Self-Attested (Front)|Passport Photo|Signature on White Paper", "Whatsapp Number"],
  ["Domicile Certificate", "Aadhaar Front Photo|Aadhaar Back Photo|Passport Photo|Family Card", "Whatsapp Number|Aadhaar Linked Phone Number"],
  ["Driving License Aadhaar Link", "", "Whatsapp Number|State Name|Aadhaar Linked Phone Number|Aadhaar Number|Driving License Number"],
  ["DSC Registration", "Aadhaar Front Photo|Aadhaar Back Photo|Passport Photo", "State Name|Aadhaar Linked Phone Number|Whatsapp Number|DSC Validity"],
  ["Duplicate Driving License", "Aadhaar Front Photo|Aadhaar Back Photo|FIR Photo/Damaged License|Driving License Self-Attested (Front)", "Whatsapp Number"],
  ["e-Shram", "Aadhaar Back Photo|Aadhaar Front Photo|Bank Passbook Front Page", "Whatsapp Number"],
  ["Farmer ID Creation", "Aadhaar Back Photo|Aadhaar Front Photo|Land Ownership Proof", "Whatsapp Number"],
  ["FASTag KYV", "RC Back Image|RC Front Image|FASTag Sticker From Inside Windshield|Vehicle Side Photo|Vehicle Front Photo", "Whatsapp Number"],
  ["FASTag One Year Pass", "RC Back Image|RC Front Image|FASTag Sticker From Inside Windshield|Vehicle Side Photo|Vehicle Front Photo", "Whatsapp Number"],
  ["FSSAI Food License Registration", "Aadhaar Front Photo|Aadhaar Back Photo|PAN Card|Address Proof|Passport Photo|No Objection Certificate", "Whatsapp Number|License Category|Business Category"],
  ["FSSAI Food License Renewal", "Aadhaar Front Photo|Aadhaar Back Photo|PAN Card|Current/Expired FSSAI License", "Whatsapp Number|License Category|Business Category"],
  ["FTI TTP Registration", "Passport Photo", "State Name|Age|Whatsapp Number|Email ID"],
  ["GST Registration", "Aadhaar Front Photo|Aadhaar Back Photo|Passport Photo", "State Name|Aadhaar Linked Phone Number|Whatsapp Number|Trade Name/Business Name|Business Constitution|Business Activity"],
  ["Haryana EWS Certificate", "Passport Photo", "Whatsapp Number|Aadhaar Linked Phone Number"],
  ["Haryana Family Card", "", "Area of Residence|Aadhaar Linked Phone Number|Whatsapp Number"],
  ["HSRP Number Plate", "RC Photo", "Whatsapp Number"],
  ["Income Certificate HR", "Family Card", "Whatsapp Number"],
  ["Income Certificate MH", "Aadhaar Front Photo|Aadhaar Back Photo|Passport Photo|Talathi Report|Signature on White Paper|Ration Card", "Whatsapp Number|Caste|Annual Income"],
  ["International Driving License", "Aadhaar Front Photo|Aadhaar Back Photo|Indian Driving License (Front)|Indian Driving License (Back)|Photo of Passport (Front)|Photo of Passport (Back)|Disability Proof", "Whatsapp Number|Vehicle Type"],
  ["Kashi Vishwanath Darshan", "Aadhaar Of Each Devotee|ID Proof Of Each Devotee", "Whatsapp Number"],
  ["Labour Card", "Aadhaar Back Photo|Aadhaar Front Photo|Bank Passbook Front Page|Passport Photo|Ration Card|90 Days Work Certificate", "Whatsapp Number"],
  ["Ladli Behena Yojana", "", "Whatsapp Number|Aadhaar Number|Father/Husband's Aadhaar Number|Caste"],
  ["Learners License", "Aadhaar Back Photo|Aadhaar Front Photo|Passport Photo|Signature on White Paper|Disability Proof", "Whatsapp Number|Mode of Test|License Category"],
  ["Legal Heir Certificate", "Aadhaar Card (of deceased)|Aadhaar Photo of Legal Heir|Crematorium Reciept|Ration Card|Notarized Application Photo|Photo of Light Bill|Photo of Death Certificate", "Whatsapp Number|State Name"],
  ["LLP Registration", "Aadhaar Front Photo|Aadhaar Back Photo|Passport Photo|PAN Card|Electricity/Water/Gas Bill|NOC By Landlord|Rent Agreement|Company Digital Signature Certificate", "State Name|Aadhaar Linked Phone Number|Whatsapp Number"],
  ["LPG eKYC", "", "Whatsapp Number"],
  ["Mahakaleshwar Darshan", "Aadhaar Of Each Devotee|ID Proof Of Each Devotee|Passport Photo", "Whatsapp Number"],
  ["MSRTC Bus Booking", "", "Whatsapp Number"],
  ["New PAN Card", "Passport Photo|Signature on White Paper|Aadhaar Card Self-Attested (Back)|Aadhaar Card Self-Attested (Front)", "Whatsapp Number"],
  ["New Passport Application", "", "Whatsapp Number|Passport Delivery Address|Educational Qualification|Fathers Name|Full Name (as per Govt ID)|Occupation Details|DOB|Nearby Police Station|Aadhaar Number|PAN Number|Email ID"],
  ["New Voter Card", "Aadhaar Back Photo|Aadhaar Front Photo|Passport Photo|Voter Card Of Any Family Member", "Whatsapp Number"],
  ["PAN Card Correction", "Passport Photo|PAN Card|Signature on White Paper|Aadhaar Card Self-Attested (Back)|Aadhaar Card Self-Attested (Front)", "Whatsapp Number"],
  ["Passport Renewal", "", "Whatsapp Number|Passport Delivery Address|Fathers Name|Full Name (as per Govt ID)|DOB|Nearby Police Station|Aadhaar Number|PAN Number|Email ID|Current Passport Number|Full Name as Per Passport"],
  ["Permanent Driving License", "Aadhaar Front Photo|Aadhaar Back Photo|Passport Photo|Learners License|Signature on White Paper", "State Name|Whatsapp Number"],
  ["PM Internship Registration", "Aadhaar Front Photo|Aadhaar Back Photo|Latest Educational Certificate|Latest CV", "Whatsapp Number"],
  ["PM Kisan eKYC", "Aadhaar Front Photo|Aadhaar Back Photo", "Whatsapp Number"],
  ["PM Kisan Samman Nidhi", "Aadhaar Front Photo|Aadhaar Back Photo|Land Ownership Proof", "Whatsapp Number|Marital Status|Caste"],
  ["PM Ujjwala Yojana", "Aadhaar Back Photo|Aadhaar Front Photo|Bank Passbook Front Page|Passport Photo|BPL Ration Card", "Whatsapp Number|Email ID"],
  ["PMJJBY", "Aadhaar Back Photo|Aadhaar Front Photo|Bank Passbook Front Page", "Whatsapp Number|Nominee Phone No|Nominee Relation|Nominee Name"],
  ["PMSBY", "Aadhaar Front Photo|Aadhaar Back Photo|Bank Passbook Front Page", "Whatsapp Number|Nominee Phone No|Nominee Relation|Nominee Name"],
  ["Reprint PAN", "Aadhaar Back Photo|Aadhaar Front Photo|PAN Card", "Whatsapp Number"],
  ["Resident Certificate Haryana Online Apply", "Aadhaar Back Photo|Aadhaar Front Photo|Passport Photo|Family Card", "Whatsapp Number"],
  ["Resident Certificate MH Apply Online", "Aadhaar Back Photo|Aadhaar Front Photo|Passport Photo|Signature on White Paper|DOB Proof (Birth Cert, School Leaving Cert, Bonafide Cert)|Ration Card|Photo of Light Bill", "Whatsapp Number"],
  ["Sai Baba Darshan", "Aadhaar Of Each Devotee|ID Proof Of Each Devotee", "Whatsapp Number"],
  ["Sauchalay Yojana", "Aadhaar Back Photo|Aadhaar Front Photo|Bank Passbook Front Page", "Whatsapp Number|Area of Residence|Caste|Panchayat Name"],
  ["Senior Citizen Card - Assam", "Aadhaar Back Photo|Aadhaar Front Photo|Passport Photo|Voter Card Back Photo|Voter Card Front Photo", "Nearby Post Office|Nearby Police Station|Emergency Contact Name|Emergency Contact Number|Whatsapp Number"],
  ["Senior Citizen Card - KA", "Aadhaar Front Photo|Aadhaar Back Photo|Passport Photo", "Emergency Contact Name|Emergency Contact Number|Whatsapp Number"],
  ["Senior Citizen Card - Maharashtra", "Voter Card Front Photo|Voter Card Back Photo|Aadhaar Back Photo|Aadhaar Front Photo|Passport Photo|Signature on White Paper|Photo of Light Bill|School Leaving Certificate", "Whatsapp Number"],
  ["Shree Ram Janmabhoomi", "Aadhaar Of Each Devotee|ID Proof Of Each Devotee|Passport Photo", "Whatsapp Number"],
  ["Srisaila Devasthanam", "Aadhaar Of Each Devotee|ID Proof Of Each Devotee", "Whatsapp Number"],
  ["UDID", "Aadhaar Front Photo|Aadhaar Back Photo|Passport Photo|Disability Proof|Signature on White Paper", "Whatsapp Number"],
  ["UDYAM Certificate", "Aadhaar Back Photo|Aadhaar Front Photo|Bank Passbook Front Page|PAN Card", "Whatsapp Number"],
  ["Vaishno Devi Service", "", "State Name|Travel Date|Whatsapp Number"],
  ["Vehicle E-Challan", "", "Whatsapp Number|Aadhaar Linked Phone Number|Registration Number"],
  ["Vehicle RC Aadhaar Linking", "", "Whatsapp Number|Registration Number|Aadhaar Linked Phone Number|Aadhaar Number|State Name|Name as per Aadhaar|RTO Office Name|RC Registration Date|RC Validity Date"],
  ["Vehicle Tax", "Aadhaar Back Photo|Aadhaar Front Photo|RC Front Image|RC Back Image", "Whatsapp Number"],
  ["Verify GSTIN", "", "Whatsapp Number|GSTIN Number"],
  ["Vitthal Rukmini", "Aadhaar Of Each Devotee|ID Proof Of Each Devotee|Passport Photo", "Whatsapp Number"],
  ["Voter Aadhaar Linking", "Voter Card Front Photo|Voter Card Back Photo|Aadhaar Front Photo|Aadhaar Back Photo", "Whatsapp Number"],
  ["Voter Card Correction", "Voter Card Back Photo|Voter Card Front Photo", "Whatsapp Number|Correction Details"],
  ["लाड़ली बहना योजना", "", "Whatsapp Number|Aadhaar Number|Father/Husband's Aadhaar Number|Caste"],
];

export const MANUAL_DOCUMENT_ROWS: ManualDocumentRow[] = RAW_DOCUMENT_ROWS.map(
  ([serviceName, documents, textFields]) => ({
    serviceName,
    documents: splitItems(documents),
    textFields: splitItems(textFields),
  })
);

