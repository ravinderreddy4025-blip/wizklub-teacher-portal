/**
 * Verify spreadsheet schools against WizKlub catalog (mapped = has region).
 * Usage: node backend/scripts/verifySpreadsheetSchools.js
 */
const fs = require('fs');
const path = require('path');

const DATA = `Andhra Pradesh	Asilmetta 3	Sandeep Kumar	SC-098/22	SC-098/22-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Eluru Cbse	Sandeep Kumar	SC-031/24	SC-031/24-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Ganapavaram	Sandeep Kumar	SC-089/22	SC-089/22-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Guntur Res	Sandeep Kumar	SC-002/25	SC-002/25-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	International School	Sandeep Kumar	SC-031/22	SC-031/22-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	International School Whitehouse	Sandeep Kumar	SC-060/22	SC-060/22-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Intl Bezawada	Sandeep Kumar	SC-027/22	SC-027/22-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Kakinada 3	Sandeep Kumar	SC-080/22	SC-080/22-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Kurmannapalem	Sandeep Kumar	SC-018/23	SC-018/23-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Madhurawada	Sandeep Kumar	SC-099/22	SC-099/22-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Madhurawada 5	Sandeep Kumar			sandeep.kumar@wizklub.in
Andhra Pradesh	Palakol 2	Sandeep Kumar	SC-090/22	SC-090/22-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Rajahmundry 1	Sandeep Kumar	SC-007/24	SC-007/24-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Reddypalem DS	Sandeep Kumar	SC-003/25	SC-003/25-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	Tadepalligudem Cbse	Sandeep Kumar	SC-011/23	SC-011/23-IB-01-12	sandeep.kumar@wizklub.in
Andhra Pradesh	TSN Puram	Sandeep Kumar	SC-094/22	SC-094/22-IB-01-12	sandeep.kumar@wizklub.in
Bengaluru	Banaswadi	Aditi Ashok Katti	SC-009/22	SC-009/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Bannerghatta Road	Aditi Ashok Katti	SC-024/22	SC-024/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Basavanagudi	Aditi Ashok Katti	SC-045/22	SC-045/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Electronic City International	Aditi Ashok Katti	SC-018/22	SC-018/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Hebbal	Aditi Ashok Katti	SC-032/22	SC-032/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Hsr Layout	Aditi Ashok Katti	SC-001/22	SC-001/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	JP Nagar	Aditi Ashok Katti	SC-006/22	SC-006/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Kaggadasapura	Aditi Ashok Katti	SC-063/22	SC-063/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Kaggadasapura Sanskriti	Aditi Ashok Katti	SC-009/23	SC-009/23-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Kaggadsapura 3	Aditi Ashok Katti	SC-002/23	SC-002/23-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Kanakapura Road	Aditi Ashok Katti	SC-013/22	SC-013/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	KR Puram	Aditi Ashok Katti	SC-010/22	SC-010/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Kudlu	Aditi Ashok Katti	SC-061/22	SC-061/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Kudlu 2	Aditi Ashok Katti	SC-053/22	SC-053/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	M S Palya	Aditi Ashok Katti	SC-036/22	SC-036/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Mahalakshmi Layout	Aditi Ashok Katti	SC-007/22	SC-007/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Marthahally	Aditi Ashok Katti	SC-040/22	SC-040/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Marthahally 2	Aditi Ashok Katti	SC-011/22	SC-011/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Nagarbhavi	Aditi Ashok Katti	SC-064/22	SC-064/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Peenya Dasarahalli	Aditi Ashok Katti	SC-056/22	SC-056/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Rajaji Nagar	Aditi Ashok Katti	SC-016/22	SC-016/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Ram Murthy Nagar	Aditi Ashok Katti	SC-065/22	SC-065/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Ram Murthy Nagar 3	Aditi Ashok Katti	SC-026/22	SC-026/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Ram Murthy Nagar 4	Aditi Ashok Katti	SC-001/23	SC-001/23-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Seshadripuram	Aditi Ashok Katti	SC-012/22	SC-012/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Ullal	Aditi Ashok Katti	SC-003/23	SC-003/23-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Uttarahalli	Aditi Ashok Katti	SC-017/22	SC-017/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Varthur	Aditi Ashok Katti	SC-010/24	SC-010/24-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Vidyaranyapura	Aditi Ashok Katti	SC-023/22	SC-023/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Whitefield	Aditi Ashok Katti	SC-008/22	SC-008/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Yellahanka	Aditi Ashok Katti	SC-037/22	SC-037/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Yeshwanthpur	Aditi Ashok Katti	SC-066/22	SC-066/22-IB-01-12	aditi.katti@wizklub.in
Chennai	Iyyapanthangal	John Emmanuel	SC-022/22	SC-022/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Keelkattalai	John Emmanuel	SC-019/22	SC-019/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	KK Nagar	John Emmanuel	SC-005/22	SC-005/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Madhavaram	John Emmanuel	SC-067/22	SC-067/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Manapakkam	John Emmanuel	SC-003/22	SC-003/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Moolakadai	John Emmanuel	SC-068/22	SC-068/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Mylapore	John Emmanuel	SC-043/22	SC-043/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Nolambur	John Emmanuel	SC-029/22	SC-029/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Palavakkam	John Emmanuel	SC-054/22	SC-054/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Pallavaram	John Emmanuel	SC-069/22	SC-069/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Pallavaram 2	John Emmanuel	SC-039/22	SC-039/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Perumbakkam	John Emmanuel	SC-070/22	SC-070/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Perungudi	John Emmanuel	SC-071/22	SC-071/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Poonamallee International School	John Emmanuel	SC-072/22	SC-072/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Ramapuram	John Emmanuel	SC-042/22	SC-042/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Royapuram	John Emmanuel	SC-020/22	SC-020/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Selaiyur	John Emmanuel	SC-011/24	SC-011/24-IB-01-12	john.emmanuel@wizklub.in
Chennai	Tambaram	John Emmanuel	SC-073/22	SC-073/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Thoraipakkam	John Emmanuel	SC-028/22	SC-028/22-IB-01-12	john.emmanuel@wizklub.in
Chennai	Velachery	John Emmanuel	SC-074/22	SC-074/22-IB-01-12	john.emmanuel@wizklub.in
Maharashtra	Aurangabad	Aditi Ashok Katti	SC-006/23	SC-006/23-IB-01-12	aditi.katti@wizklub.in
Maharashtra	Aurangabad 2	Aditi Ashok Katti	SC-023/24	SC-023/24-IB-01-12	aditi.katti@wizklub.in
Maharashtra	Bavadhan	Aditi Ashok Katti	SC-049/22	SC-049/22-IB-01-12	aditi.katti@wizklub.in
Maharashtra	Dombivali	Aditi Ashok Katti	SC-003/24	SC-003/24-IB-01-12	aditi.katti@wizklub.in
Maharashtra	Nanded	Aditi Ashok Katti	SC-010/23	SC-010/23-IB-01-12	aditi.katti@wizklub.in
Maharashtra	Nashik	Aditi Ashok Katti	SC-004/25	SC-004/25-IB-01-12	aditi.katti@wizklub.in
Maharashtra	Nashik 2	Aditi Ashok Katti	SC-005/25	SC-005/25-IB-01-12	aditi.katti@wizklub.in
Maharashtra	Ulhasnagar	Aditi Ashok Katti	SC-087/22	SC-087/22-IB-01-12	aditi.katti@wizklub.in
Maharashtra	Wagholi	Aditi Ashok Katti	SC-044/22	SC-044/22-IB-01-12	aditi.katti@wizklub.in
Rest of India	Faridabad	Himanshu Verma	SC-008/23	SC-008/23-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Faridabad 2	Himanshu Verma	SC-016/24	SC-016/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Ghaziabad	Himanshu Verma	SC-034/24	SC-034/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Ghaziabad 2	Himanshu Verma	SC-035/24	SC-035/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Gurugram 1	Himanshu Verma	SC-059/22	SC-059/22-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Gurugram 2	Himanshu Verma	SC-047/22	SC-047/22-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Gurugram 3	Himanshu Verma	SC-012/24	SC-012/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Gurugram 4	Himanshu Verma	SC-058/22	SC-058/22-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Gurugram 6	Himanshu Verma	SC-017/24	SC-017/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Gurugram 9	Himanshu Verma	SC-018/24	SC-018/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Noida 1	Himanshu Verma	SC-005/23	SC-005/23-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Noida 2	Himanshu Verma	SC-005/24	SC-005/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Noida 3	Himanshu Verma	SC-002/24	SC-002/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Ambala	Himanshu Verma	SC-015/24	SC-015/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Karnal	Himanshu Verma	SC-006/24	SC-006/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Panipat	Himanshu Verma	SC-019/24	SC-019/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Dhuri 2	Himanshu Verma	SC-026/24	SC-026/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Hathan	Himanshu Verma	SC-027/24	SC-027/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Jalandhar	Himanshu Verma	SC-028/24	SC-028/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Malsian	Himanshu Verma	SC-029/24	SC-029/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Sunam	Himanshu Verma	SC-030/24	SC-030/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Bikaner	Himanshu Verma	SC-012/23	SC-012/23-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Jaipur 1	Himanshu Verma	SC-057/22	SC-057/22-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Jaipur 2	Himanshu Verma	SC-007/23	SC-007/23-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Jaipur 3	Himanshu Verma	SC-004/24	SC-004/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Jaipur 4	Himanshu Verma	SC-032/24	SC-032/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Jodhpur	Himanshu Verma	SC-013/23	SC-013/23-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Agra	Himanshu Verma	SC-095/22	SC-095/22-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Lucknow 1	Himanshu Verma	SC-096/22	SC-096/22-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Muzaffarnagar	Himanshu Verma	SC-097/22	SC-097/22-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Shamli	Himanshu Verma	SC-017/23	SC-017/23-IB-01-12	himanshu.verma@infinitylearn.com
Rest of India	Dehradun	Himanshu Verma	SC-036/24	SC-036/24-IB-01-12	himanshu.verma@infinitylearn.com
Rest of Karnataka	Ballari School	Aditi Ashok Katti	SC-030/22	SC-030/22-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Davanagere	Aditi Ashok Katti	SC-051/22	SC-051/22-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Dr.B.S Rao Vidya Soudha Mysore	Aditi Ashok Katti	SC-001/25	SC-001/25-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Gangavathi	Aditi Ashok Katti	SC-046/22	SC-046/22-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Hospet	Aditi Ashok Katti	SC-048/22	SC-048/22-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Hubli	Aditi Ashok Katti	SC-038/22	SC-038/22-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Mandya	Aditi Ashok Katti	SC-081/22	SC-081/22-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Mangalore	Aditi Ashok Katti	SC-015/22	SC-015/22-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Raichur-3	Aditi Ashok Katti	SC-082/22	SC-082/22-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Sindhanur	Aditi Ashok Katti	SC-083/22	SC-083/22-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Tumkur	Aditi Ashok Katti	SC-025/22	SC-025/22-IB-01-12	aditi.katti@wizklub.in
Rest of Karnataka	Tumkur 3	Aditi Ashok Katti	SC-014/22	SC-014/22-IB-01-12	aditi.katti@wizklub.in
Rest of Tamil Nadu	Coimbatore	John Emmanuel	SC-002/22	SC-002/22-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Coimbatore 2	John Emmanuel	SC-035/22	SC-035/22-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Coimbatore 4	John Emmanuel	SC-052/22	SC-052/22-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Coimbatore 6	John Emmanuel	SC-008/25	SC-008/25-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Dindigul	John Emmanuel	SC-009/25	SC-009/25-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Erode	John Emmanuel	SC-034/22	SC-034/22-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Hosur	John Emmanuel	SC-021/22	SC-021/22-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Hosur 2	John Emmanuel	SC-041/22	SC-041/22-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Hosur 3	John Emmanuel	SC-004/23	SC-004/23-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Karur	John Emmanuel	SC-091/22	SC-091/22-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Krishnagiri	John Emmanuel	SC-015/23	SC-015/23-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Namakkal	John Emmanuel	SC-092/22	SC-092/22-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Salem	John Emmanuel	SC-004/22	SC-004/22-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Thiruvanamalai	John Emmanuel	SC-016/23	SC-016/23-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Tiruppur	John Emmanuel	SC-093/22	SC-093/22-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Tiruppur 2	John Emmanuel	SC-010/25	SC-010/25-IB-01-12	john.emmanuel@wizklub.in
Rest of Tamil Nadu	Trichy	John Emmanuel	SC-055/22	SC-055/22-IB-01-12	john.emmanuel@wizklub.in
Telangana	Adibatla	Sandeep Kumar	SC-013/24	SC-013/24-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Chaitanyapuri Cbse	Sandeep Kumar	SC-075/22	SC-075/22-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Ecil 3	Sandeep Kumar	SC-085/22	SC-085/22-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Gundla Pochampally Cbse	Sandeep Kumar	SC-021/24	SC-021/24-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Hasmathpet	Sandeep Kumar	SC-086/22	SC-086/22-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Himayatnagar	Sandeep Kumar	SC-006/25	SC-006/25-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Jubilee Hills	Sandeep Kumar	SC-062/22	SC-062/22-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Khalsa	Sandeep Kumar	SC-076/22	SC-076/22-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Kompally 2	Sandeep Kumar	SC-024/24	SC-024/24-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Kompally 5	Sandeep Kumar	SC-084/22	SC-084/22-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Manikonda	Sandeep Kumar	SC-008/24	SC-008/24-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Mehdipatnam	Sandeep Kumar	SC-024/24	SC-024/24-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Nacharam	Sandeep Kumar	SC-088/22	SC-088/22-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Nagole	Sandeep Kumar	SC-014/24	SC-014/24-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Nallagandla	Sandeep Kumar	SC-033/22	SC-033/22-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Nallakunta	Sandeep Kumar	SC-007/25	SC-007/25-IB-01-12	sandeep.kumar@wizklub.in
Telangana	NTPC Ramagundam	Sandeep Kumar	SC-033/24	SC-033/24-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Ramagundam	Sandeep Kumar	SC-014/23	SC-014/23-IB-01-12	sandeep.kumar@wizklub.in
Telangana	Sr Nagar	Sandeep Kumar	SC-009/24	SC-009/24-IB-01-12	sandeep.kumar@wizklub.in
West Bengal	Bada Bazar	Aditi Ashok Katti	SC-077/22	SC-077/22-IB-01-12	aditi.katti@wizklub.in
West Bengal	Dunlop	Aditi Ashok Katti	SC-050/22	SC-050/22-IB-01-12	aditi.katti@wizklub.in
West Bengal	Howrah	Aditi Ashok Katti	SC-020/24	SC-020/24-IB-01-12	aditi.katti@wizklub.in
West Bengal	New Town	Aditi Ashok Katti	SC-078/22	SC-078/22-IB-01-12	aditi.katti@wizklub.in
West Bengal	New Town 2	Aditi Ashok Katti	SC-001/24	SC-001/24-IB-01-12	aditi.katti@wizklub.in
West Bengal	Serampore	Aditi Ashok Katti	SC-079/22	SC-079/22-IB-01-12	aditi.katti@wizklub.in
Bengaluru	Rampura	Aditi Ashok Katti			aditi.katti@wizklub.in
Bengaluru	Doddaballapur Road	Aditi Ashok Katti			aditi.katti@wizklub.in
Bengaluru	Nagadevanahalli 1	Aditi Ashok Katti			aditi.katti@wizklub.in
Chennai	Padur	John Emmanuel			john.emmanuel@wizklub.in
Chennai	Valasaravakkam	John Emmanuel			john.emmanuel@wizklub.in
Maharashtra	Shrirampur	Aditi Ashok Katti			aditi.katti@wizklub.in
Maharashtra	Ahmednagar	Aditi Ashok Katti			aditi.katti@wizklub.in
Maharashtra	Shirdi	Aditi Ashok Katti			aditi.katti@wizklub.in
Maharashtra	Badlapur	Aditi Ashok Katti			aditi.katti@wizklub.in
Rest of India	Bareilly	Himanshu Verma			himanshu.verma@infinitylearn.com
Rest of India	Agra 2	Himanshu Verma			himanshu.verma@infinitylearn.com
Rest of India	Chandigarh	Himanshu Verma			himanshu.verma@infinitylearn.com
Rest Of Karnataka	Hospet 2	Aditi Ashok Katti			aditi.katti@wizklub.in
Rest Of Karnataka	Belagavi 2	Aditi Ashok Katti			aditi.katti@wizklub.in
Rest Of Tamil Nadu	Coimbatore Chetty Street	John Emmanuel			john.emmanuel@wizklub.in
Rest Of Tamil Nadu	Tiruchengode	John Emmanuel			john.emmanuel@wizklub.in
Telangana	Serilingampally	Sandeep Kumar			sandeep.kumar@wizklub.in
Telangana	Kushaiguda Ecil 1	Sandeep Kumar			sandeep.kumar@wizklub.in
Telangana	M G Road	Sandeep Kumar			sandeep.kumar@wizklub.in
Telangana	Beeramguda	Sandeep Kumar			sandeep.kumar@wizklub.in
Telangana	Habsiguda 2	Sandeep Kumar			sandeep.kumar@wizklub.in
Telangana	Kukatpally	Sandeep Kumar			sandeep.kumar@wizklub.in
Telangana	Kukatpally 2	Sandeep Kumar			sandeep.kumar@wizklub.in
West Bengal	Chinsurah	Aditi Ashok Katti			aditi.katti@wizklub.in
Telangana	Hyderguda	Sandeep Kumar			sandeep.kumar@wizklub.in
Rest of India	Gurugram 12	Himanshu Verma			himanshu.verma@infinitylearn.com
Rest Of Karnataka	Bhagathsingh Nagar Boys Res	Aditi Ashok Katti			aditi.katti@wizklub.in
Rest Of Tamil Nadu	Pollachi	John Emmanuel			john.emmanuel@wizklub.in
Rest Of Tamil Nadu	Vellore	John Emmanuel			john.emmanuel@wizklub.in`;

const STATE_TO_WIZKLUB_REGIONS = {
  'andhra pradesh': ['andhra pradesh'],
  bengaluru: ['bengaluru'],
  chennai: ['tamil nadu'],
  maharashtra: ['maharashtra'],
  'rest of india': ['delhi ncr', 'rajasthan', 'uttar pradesh', 'punjab', 'haryana', 'uttarakhand'],
  'rest of karnataka': ['karnataka'],
  'rest of tamil nadu': ['tamil nadu'],
  telangana: ['telangana'],
  'west bengal': ['west bengal'],
};

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function expandBranchAliases(branch) {
  let b = norm(branch);
  if (b.startsWith('intl ')) b = `international ${b.slice(5)}`;
  return b;
}

function branchFromWizklubName(name) {
  const b = norm(String(name || '').replace(/^sri chaitanya[\s-]*/i, ''));
  return b.length >= 2 ? b : null;
}

function parseRows(raw) {
  return raw.trim().split('\n').map((line) => {
    const p = line.split('\t');
    return {
      state: p[0]?.trim(),
      branch: p[1]?.trim(),
      am: p[2]?.trim(),
      schoolId: p[3]?.trim(),
      componentId: p[4]?.trim(),
      amEmail: p[5]?.trim(),
    };
  });
}

function regionMatches(state, wizklubRegion) {
  const key = norm(state);
  const allowed = STATE_TO_WIZKLUB_REGIONS[key] || [key.replace(/^rest of /, '')];
  const r = norm(wizklubRegion);
  return allowed.some((a) => r === a || r.includes(a) || a.includes(r));
}

function scoreBranch(a, b) {
  if (!a || !b) return 0;
  const aa = a.replace(/\bkaggads\b/g, 'kaggadas').replace(/\byellahank\b/g, 'yelahank');
  const bb = b.replace(/\bkaggads\b/g, 'kaggadas').replace(/\byellahank\b/g, 'yelahank');
  if (aa === bb) return 100;
  if (aa.includes(bb) || bb.includes(aa)) return 85;
  const stripNum = (x) => x.replace(/\s+\d+$/, '');
  if (stripNum(aa) === stripNum(bb)) return 75;
  const ta = new Set(aa.split(' ').filter(Boolean));
  const tb = new Set(bb.split(' ').filter(Boolean));
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter += 1; });
  return (inter / Math.max(ta.size, tb.size, 1)) * 65;
}

function suggestedWizklubRegion(state) {
  const key = norm(state);
  const display = {
    'andhra pradesh': 'Andhra Pradesh',
    bengaluru: 'Bengaluru',
    chennai: 'Tamil Nadu',
    maharashtra: 'Maharashtra',
    'rest of india': 'Delhi NCR / Rajasthan / Uttar Pradesh / Punjab / Haryana / Uttarakhand',
    'rest of karnataka': 'Karnataka',
    'rest of tamil nadu': 'Tamil Nadu',
    telangana: 'Telangana',
    'west bengal': 'West Bengal',
  };
  if (display[key]) return display[key];
  return String(state || '').trim();
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function issueLabel(status) {
  if (status === 'not_found') return 'missing_from_api';
  if (status === 'found_not_mapped') return 'missing_region';
  if (status === 'mapped_region_mismatch') return 'region_mismatch';
  return '';
}

function writeFixListCsv(results, outPath) {
  const gaps = results.filter((r) => ['not_found', 'found_not_mapped', 'mapped_region_mismatch'].includes(r.status));
  const header = [
    'Issue',
    'State',
    'Branch',
    'School ID',
    'Component ID',
    'AM Name',
    'AM Email',
    'Suggested WizKlub Region',
    'WizKlub ID',
    'WizKlub Name',
    'WizKlub Region',
  ];
  const lines = [header.join(',')];
  gaps.forEach((r) => {
    lines.push([
      issueLabel(r.status),
      r.state,
      r.branch,
      r.schoolId,
      r.componentId,
      r.am,
      r.amEmail,
      suggestedWizklubRegion(r.state),
      r.wizklubId,
      r.wizklubName,
      r.wizklubRegion,
    ].map(csvEscape).join(','));
  });
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
  return { path: outPath, gapCount: gaps.length };
}

function writeEmailDraft(summary, csvPath, outPath) {
  const body = `Subject: WizKlub school master data — gaps vs our operational list (192 schools)

Hi team,

We compared our operational school list (192 schools) to GET /v1/schools.

Summary:
- ${summary.mapped} schools — OK (have region, ready for inventory after your confirmation)
- ${summary.notFound} schools — missing entirely from the API (please add to master data)
- ${summary.foundNotMapped} schools — in the API but region / region_id is empty (please assign region)
${summary.mappedRegionMismatch ? `- ${summary.mappedRegionMismatch} schools — region mismatch (please review)` : ''}

Attached: wizklub-fix-list.csv (${summary.notFound + summary.foundNotMapped + (summary.mappedRegionMismatch || 0)} rows needing action)

Please use the "Suggested WizKlub Region" column when setting region. Notes:
- Chennai / Rest of Tamil Nadu → Tamil Nadu
- Rest of Karnataka → Karnataka
- Rest of India → Delhi NCR, Rajasthan, Uttar Pradesh, Punjab, Haryana, or Uttarakhand (by city)

After you update master data, we will re-export the API, re-verify, and register schools in inventory.

Thanks,
[Your name]

---
CSV file: ${csvPath}
Generated: ${new Date().toISOString()}
`;
  fs.writeFileSync(outPath, body, 'utf8');
}

function main() {
  const catalogPath = path.resolve(__dirname, '../../wizklub-schools-all.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).schools;
  const rows = parseRows(DATA);

  const results = rows.map((row) => {
    const branchKey = expandBranchAliases(row.branch);
    const candidates = catalog
      .map((s) => {
        const wb = branchFromWizklubName(s.name);
        if (!wb) return null;
        return {
          school: s,
          branchScore: scoreBranch(branchKey, wb),
          regionOk: s.region ? regionMatches(row.state, s.region) : false,
          mapped: Boolean(s.region && String(s.region).trim()),
        };
      })
      .filter(Boolean)
      .filter((c) => c.branchScore >= 55)
      .sort((a, b) => (b.regionOk - a.regionOk) || (b.branchScore - a.branchScore) || (b.mapped - a.mapped));

    const best = candidates[0];
    const altMapped = candidates.find((c) => c.mapped && c.regionOk)
      || candidates.find((c) => c.mapped && c.branchScore >= 75);

    let status = 'not_found';
    if (altMapped) status = 'mapped';
    else if (best?.mapped) status = 'mapped_region_mismatch';
    else if (best) status = 'found_not_mapped';

    return {
      ...row,
      status,
      wizklubId: altMapped?.school.id || best?.school.id || null,
      wizklubName: altMapped?.school.name || best?.school.name || null,
      wizklubRegion: altMapped?.school.region || best?.school.region || null,
      matchScore: altMapped?.branchScore || best?.branchScore || 0,
    };
  });

  const summary = {
    total: results.length,
    mapped: results.filter((r) => r.status === 'mapped').length,
    mappedRegionMismatch: results.filter((r) => r.status === 'mapped_region_mismatch').length,
    foundNotMapped: results.filter((r) => r.status === 'found_not_mapped').length,
    notFound: results.filter((r) => r.status === 'not_found').length,
  };

  const outPath = path.resolve(__dirname, '../../spreadsheet-wizklub-verification.json');
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));

  const csvPath = path.resolve(__dirname, '../../wizklub-fix-list.csv');
  const { gapCount } = writeFixListCsv(results, csvPath);

  const emailPath = path.resolve(__dirname, '../../wizklub-gap-email-draft.txt');
  writeEmailDraft(summary, csvPath, emailPath);

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nFix list CSV (${gapCount} gaps): ${csvPath}`);
  console.log(`Email draft: ${emailPath}`);
  console.log('\n--- NOT FOUND ---');
  results.filter((r) => r.status === 'not_found').forEach((r) => {
    console.log(`${r.state} | ${r.branch} | ${r.schoolId || 'no ID'}`);
  });
  console.log('\n--- FOUND BUT NOT MAPPED (no WizKlub region) ---');
  results.filter((r) => r.status === 'found_not_mapped').forEach((r) => {
    console.log(`${r.state} | ${r.branch} | wizklub: ${r.wizklubName} (${r.wizklubId})`);
  });
  console.log('\n--- MAPPED BUT REGION MISMATCH ---');
  results.filter((r) => r.status === 'mapped_region_mismatch').slice(0, 30).forEach((r) => {
    console.log(`${r.state} | ${r.branch} | wizklub region: ${r.wizklubRegion} | ${r.wizklubName}`);
  });
  console.log(`\nFull report: ${outPath}`);
}

module.exports = {
  parseRows,
  writeFixListCsv,
  writeEmailDraft,
  suggestedWizklubRegion,
  issueLabel,
};

if (require.main === module) {
  main();
}
