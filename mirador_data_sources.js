/**
 * MIRADOR Data Source Registry
 * ============================
 * Complete catalog of every database, repository, and primary literature source
 * that feeds the MIRADOR framework across all four disease instances.
 *
 * Author: Bee Rosa Davis / Davis Geometric
 * Last updated: 2026-03-26
 *
 * Organization:
 *   - SUSCEPTIBILITY: MIC, IC50, breakpoint databases
 *   - PHARMACOKINETICS: AUC, clearance, Vd, systemic PK parameters
 *   - TISSUE_PENETRATION: tissue:plasma ratios (R values) by organ/compartment
 *   - BIOFILM: MBEC, biofilm-specific susceptibility data
 *   - RESISTANCE: genotypic/phenotypic resistance databases
 *   - CLINICAL_OUTCOMES: guideline rankings, trial outcomes, ground truths
 *   - STRUCTURAL: protein structures, binding data, molecular targets
 *   - GENOMIC: pathogen genomics, mutation databases
 *   - EPIDEMIOLOGICAL: surveillance, incidence, prevalence
 *   - PHARMACOGENOMIC: metabolizer phenotypes, allele frequencies
 *   - ONTOLOGIES: chemical, disease, and drug ontologies for annotation
 *   - COMPUTATIONAL: PBPK platforms, modeling tools
 *   - PRIMARY_LITERATURE: key review papers that aggregate tissue PK data
 */

const MIRADOR_DATA_SOURCES = {

  // =========================================================================
  // SUSCEPTIBILITY DATA (MIC, IC50, Breakpoints)
  // Feeds: τ = log10(AUC24 / MIC) — the denominator of pharmacophoric potential
  // =========================================================================
  SUSCEPTIBILITY: [
    {
      id: "EUCAST",
      name: "European Committee on Antimicrobial Susceptibility Testing",
      url: "https://www.eucast.org",
      data_url: "https://www.eucast.org/mic_and_zone_distributions_and_ecoffs",
      breakpoint_url: "https://www.eucast.org/clinical_breakpoints",
      version: "v14.0 (2024-01-01)",
      type: "MIC breakpoints + MIC distributions",
      access: "free, open",
      records: "30,000+ MIC distributions",
      organisms: "bacteria, fungi",
      scope: "All four disease instances (MRSA, TB, meningitis pathogens)",
      curators: "Gunnar Kahlmeter, John Turnidge, Erika Matuschek",
      mirador_usage: "Primary MIC source for all bacterial disease instances",
      citation: "Kahlmeter G, et al. Clin Microbiol Rev. 2022;35(1):e00141-21",
      notes: "Gold standard for European breakpoints. EUCAST and CLSI agree on most breakpoints. Includes mycobacteria via AMST subcommittee."
    },
    {
      id: "CLSI_M100",
      name: "Clinical and Laboratory Standards Institute — M100",
      url: "https://clsi.org",
      version: "M100-S34 (2024)",
      type: "MIC breakpoints (US standard)",
      access: "paywalled (institutional subscription)",
      scope: "All bacterial disease instances",
      mirador_usage: "Cross-reference for US-based MIC breakpoints; used when EUCAST values unavailable",
      citation: "CLSI. Performance Standards for Antimicrobial Susceptibility Testing. 34th ed. CLSI supplement M100. 2024.",
      notes: "US counterpart to EUCAST. Where EUCAST and CLSI diverge, cite both."
    },
    {
      id: "CLSI_M24",
      name: "CLSI M24 — Susceptibility Testing of Mycobacteria",
      url: "https://clsi.org",
      version: "M24-A2 (2011) + supplements",
      type: "MIC breakpoints for mycobacteria",
      access: "paywalled",
      scope: "TB disease instance",
      mirador_usage: "TB-specific MIC breakpoints for INH, RIF, PZA, EMB, fluoroquinolones",
      notes: "Standard for mycobacterial susceptibility testing in the US."
    },
    {
      id: "STANFORD_HIVDB",
      name: "Stanford HIV Drug Resistance Database",
      url: "https://hivdb.stanford.edu",
      genotype_url: "https://hivdb.stanford.edu/cgi-bin/Reference.cgi",
      type: "IC50, genotype-phenotype correlations, resistance mutations",
      access: "free, open",
      records: "2,305 references, 10,000+ genotype-treatment correlations",
      version: "v9.6 (current)",
      scope: "HIV disease instance",
      mirador_usage: "Primary IC50 source for all antiretrovirals; resistance mutation data",
      curators: "Robert W. Shafer, Stanford University",
      citation: "Shafer RW. J Infect Dis. 2006;194(s1):S51-S58",
      notes: "The definitive HIV drug resistance database. Founded 1998. Includes genotype-treatment, genotype-phenotype, and genotype-outcome correlations."
    },
    {
      id: "CHEMPDB",
      name: "ChEMBL — Chemical Database of Bioactive Molecules",
      url: "https://www.ebi.ac.uk/chembl/",
      type: "IC50, EC50, Ki, bioactivity data",
      access: "free, open",
      records: "2.4M+ compound records, 20M+ bioactivity measurements",
      scope: "All disease instances (cross-reference for IC50/MIC values)",
      mirador_usage: "Secondary IC50/MIC source for cross-validation",
      citation: "Zdrazil B, et al. Nucleic Acids Res. 2024;52(D1):D1180-D1192",
      notes: "Maintained by EMBL-EBI. Largest open bioactivity database."
    },
    {
      id: "PUBCHEM_BIOASSAY",
      name: "PubChem BioAssay",
      url: "https://pubchem.ncbi.nlm.nih.gov",
      type: "Bioassay results including MIC, IC50",
      access: "free, open",
      scope: "Cross-reference for all disease instances",
      mirador_usage: "Tertiary source for cross-validation of MIC/IC50 values",
      citation: "Kim S, et al. Nucleic Acids Res. 2023;51(D1):D1373-D1380"
    },
    {
      id: "WHO_CC_AMR",
      name: "WHO Collaborating Centre for Surveillance of Antimicrobial Resistance",
      url: "https://www.who.int/health-topics/antimicrobial-resistance",
      type: "Global MIC surveillance data",
      access: "free (reports), restricted (raw data)",
      scope: "All bacterial instances, especially TB",
      mirador_usage: "Global MIC surveillance data for epidemiological context"
    }
  ],

  // =========================================================================
  // PHARMACOKINETICS DATA (AUC, Cmax, CL, Vd, half-life)
  // Feeds: τ = log10(AUC24 / MIC) — the numerator of pharmacophoric potential
  // =========================================================================
  PHARMACOKINETICS: [
    {
      id: "PK_DB",
      name: "PK-DB — Pharmacokinetics Database",
      url: "https://pk-db.com",
      github: "https://github.com/matthiaskoenig/pkdb",
      type: "Curated PK parameters from clinical trials",
      access: "free, open, REST API",
      records: "512 studies, 73,017 outputs, 3,148 time-courses",
      scope: "Cross-disease AUC24 cross-validation",
      mirador_usage: "Cross-checking AUC24 values used in τ computation",
      citation: "Grzegorzewski J, et al. Nucleic Acids Res. 2021;49(D1):D1358-D1364",
      notes: "Open-source. Automatic PK parameter calculation from concentration-time curves. REST API for programmatic access."
    },
    {
      id: "DRUGBANK",
      name: "DrugBank",
      url: "https://go.drugbank.com",
      type: "Drug PK parameters, ADMET properties, drug-drug interactions",
      access: "free (basic), commercial (full)",
      records: "16,000+ drug entries",
      scope: "All disease instances — ADMET parameters for K_admet computation",
      mirador_usage: "Bioavailability, protein binding, clearance, Vd for K_admet; drug-drug interaction flags",
      citation: "Wishart DS, et al. Nucleic Acids Res. 2018;46(D1):D1074-D1082"
    },
    {
      id: "FDA_LABEL_DB",
      name: "FDA Drug Label Database (DailyMed)",
      url: "https://dailymed.nlm.nih.gov",
      type: "FDA-approved prescribing information including PK sections",
      access: "free, open",
      scope: "All disease instances",
      mirador_usage: "Official PK parameters (AUC, Cmax, Vd, CL, protein binding) from FDA labels",
      notes: "Source of truth for approved dosing PK. Section 12.3 of each label contains clinical pharmacology."
    },
    {
      id: "EMA_EPAR",
      name: "EMA European Public Assessment Reports",
      url: "https://www.ema.europa.eu/en/medicines",
      type: "European regulatory PK assessments",
      access: "free, open",
      scope: "All disease instances",
      mirador_usage: "European PK data cross-reference; pediatric PK appendices"
    },
    {
      id: "PKPDAI",
      name: "PKPD.ai — Open Source PK Prediction Database",
      url: "https://www.pkpdai.com",
      type: "Curated clearance and PK parameter data with AI prediction",
      access: "free, open (in development)",
      scope: "Cross-disease PK parameter validation",
      citation: "Gonzalez Hernandez F, et al. UCL GOS Institute of Child Health"
    },
    {
      id: "SIMCYP",
      name: "Simcyp PBPK Simulator — Compound Library",
      url: "https://www.certara.com/software/simcyp-pbpk/",
      type: "PBPK model compound files with validated PK parameters",
      access: "commercial (academic licenses available)",
      records: "100+ validated compound files",
      scope: "Cross-reference for PBPK-derived parameters",
      mirador_usage: "PBPK-validated PK parameters for cross-checking τ inputs",
      notes: "MIRADOR consumes PBPK outputs; Simcyp is a primary PBPK platform."
    },
    {
      id: "OPEN_SYSTEMS_PHARMACOLOGY",
      name: "Open Systems Pharmacology Suite (PK-Sim / MoBi)",
      url: "https://www.open-systems-pharmacology.org",
      github: "https://github.com/Open-Systems-Pharmacology",
      type: "Open-source PBPK modeling platform",
      access: "free, open-source",
      scope: "PBPK model validation and parameter extraction",
      mirador_usage: "Open-source PBPK cross-reference for R values and AUC computation"
    }
  ],

  // =========================================================================
  // TISSUE PENETRATION DATA (tissue:plasma ratios R)
  // Feeds: K_barrier = max(1/R - 1, -1) — the barrier curvature
  // =========================================================================
  TISSUE_PENETRATION: {

    BONE: [
      {
        id: "LANDERSDORFER_2009",
        citation: "Landersdorfer CB, et al. Clin Pharmacokinet. 2009;48(2):89-124",
        type: "Comprehensive review of antibiotic bone penetration",
        drugs_covered: "30+ antibiotics",
        data_type: "bone:serum ratios from published studies",
        mirador_usage: "Primary source for R_bone values in bone MRSA instance",
        notes: "The most comprehensive bone penetration review available. Aggregates data from multiple PK study methodologies."
      },
      {
        id: "THABIT_2019",
        citation: "Thabit AK, et al. Int J Infect Dis. 2019;81:128-136",
        type: "Updated review of antibiotic bone and joint penetration",
        drugs_covered: "30+ antibiotics",
        data_type: "bone:serum, joint:serum ratios",
        mirador_usage: "Updated R_bone values, cross-reference with Landersdorfer"
      },
      {
        id: "GRAZIANI_1988",
        citation: "Graziani AL, et al. Antimicrob Agents Chemother. 1988;32(9):1320-1322",
        type: "Vancomycin bone penetration (infected vs uninflamed)",
        data_type: "bone:serum ratios in hip arthroplasty and osteomyelitis",
        mirador_usage: "Vancomycin R_bone = 0.10-0.30; CRP inflammation modifier source"
      },
      {
        id: "BUE_2018",
        citation: "Bue M, et al. J Orthop Res. 2018;36(4):1093-1098",
        type: "Vancomycin bone PK in porcine osteomyelitis (microdialysis)",
        data_type: "continuous bone concentration-time curves via microdialysis",
        mirador_usage: "R_bone = 0.20-0.74 range; infection reduces penetration; CRP modifier validation"
      },
      {
        id: "RICCOBENE_2014",
        citation: "Riccobene TA, et al. Antimicrob Agents Chemother. 2014;58(5):2512-2519",
        type: "Ceftaroline bone penetration",
        data_type: "bone:plasma ratio from surgical bone samples",
        mirador_usage: "Ceftaroline R_bone = 0.20-0.40"
      },
      {
        id: "RANA_2002",
        citation: "Rana B, et al. J Antimicrob Chemother. 2002;50(5):747-750",
        type: "Linezolid bone penetration",
        data_type: "bone:serum ratio from hip arthroplasty",
        mirador_usage: "Linezolid R_bone = 0.40-0.60"
      },
      {
        id: "CURRIER_1979",
        citation: "Currier BL, et al. J Bone Joint Surg Am. 1979;61:1030-1034",
        type: "Rifampin bone penetration",
        data_type: "bone:serum ratio",
        mirador_usage: "Rifampin R_bone = 0.20-0.50"
      },
      {
        id: "TRAUNMULLER_2010",
        citation: "Traunmüller F, et al. Antimicrob Agents Chemother. 2010;54(8):3576-3578",
        type: "Daptomycin bone penetration",
        data_type: "bone:serum ratio from microdialysis",
        mirador_usage: "Daptomycin R_bone = 0.10-0.20"
      },
      {
        id: "FEIGIN_1995",
        citation: "Feigin RD, et al. Pediatr Infect Dis J. 1995;14(suppl):S85-S92",
        type: "Clindamycin bone penetration (pediatric)",
        data_type: "bone:serum ratio",
        mirador_usage: "Clindamycin R_bone = 0.30-0.75"
      }
    ],

    TB_CASEUM_GRANULOMA: [
      {
        id: "DARTOIS_2014",
        citation: "Dartois V. Nat Rev Microbiol. 2014;12(3):159-167",
        type: "Landmark review: drug path from blood to lesions to mycobacteria",
        mirador_usage: "Conceptual framework for heterogeneous TB barrier model; caseum as dominant barrier",
        notes: "The single most cited reference for TB drug distribution."
      },
      {
        id: "PRIDEAUX_2015",
        citation: "Prideaux B, et al. Nat Med. 2015;21(10):1223-1227",
        type: "MALDI-MS imaging of TB drug distribution in human lesions",
        data_type: "Spatial drug distribution in cellular, caseous, and cavity lesions",
        drugs_covered: "INH, RIF, PZA, MXF, CFZ, LZD",
        mirador_usage: "Primary source for lesion-specific R values in TB instance",
        notes: "First direct visualization of drug distribution in human TB lesions. Showed sterilizing activity correlates with lesion penetration."
      },
      {
        id: "SARATHY_2016",
        citation: "Sarathy JP, et al. ACS Infect Dis. 2016;2(8):552-563",
        type: "Prediction of drug penetration in TB lesions (caseum binding assay)",
        data_type: "Caseum binding fractions, in silico binding prediction",
        drugs_covered: "279 compounds profiled",
        mirador_usage: "Caseum binding → penetration prediction; rule-of-thumb (clogP + aromatic ring count)",
        notes: "High-throughput caseum binding assay predicts in vivo lesion penetration."
      },
      {
        id: "KJELLSSON_2012",
        citation: "Kjellsson MC, et al. Antimicrob Agents Chemother. 2012;56(1):446-457",
        type: "PK evaluation of TB drug penetration in rabbit pulmonary lesions",
        data_type: "tissue-to-plasma ratios per lesion type (solid, caseous, cavity)",
        drugs_covered: "INH, RIF, PZA, MXF",
        mirador_usage: "Quantitative R values per lesion type per drug; cavity caseum data",
        notes: "RIF tissue:plasma ~3 in caseum; INH ~2 in caseum, ~0.5 in fibrotic wall; PZA undetectable in caseum."
      },
      {
        id: "SARATHY_2017_JOVE",
        citation: "Sarathy JP, et al. J Vis Exp. 2017;(123):e55559",
        type: "In vitro caseum binding assay protocol",
        mirador_usage: "Methodology reference for caseum binding measurements"
      },
      {
        id: "SARATHY_2018_AAC",
        citation: "Sarathy JP, et al. Antimicrob Agents Chemother. 2018;62(2):e02266-17",
        type: "Extreme drug tolerance of M. tuberculosis in caseum",
        mirador_usage: "K_pheno for caseum-resident TB subpopulations"
      },
      {
        id: "STRYDOM_2019",
        citation: "Strydom N, et al. PLOS Med. 2019;16(4):e1002773",
        type: "Lesion-focused population PK model for 7 TB drugs in human lesions",
        data_type: "Drug concentration-time profiles in 9 distinct human lesion tissues",
        drugs_covered: "INH, RIF, PZA, MFX, KAN, CFZ, LZD",
        mirador_usage: "Quantitative R values for 9 lesion tissue types; first human lesion PK model"
      },
      {
        id: "ZIMMERMAN_2017",
        citation: "Zimmerman M, et al. Antimicrob Agents Chemother. 2017;61(9):e00924-17",
        type: "Ethambutol partitioning in TB pulmonary lesions",
        data_type: "MALDI imaging of EMB in rabbit granulomas",
        mirador_usage: "EMB cellular accumulation data (basis for EMB geometric ranking in TB)"
      },
      {
        id: "CICCHESE_2020",
        citation: "Cicchese JM, et al. Front Pharmacol. 2020;11:333",
        type: "Agent-based model of TB granuloma drug distribution",
        mirador_usage: "GranSim computational model cross-reference for heterogeneous barrier validation"
      }
    ],

    CSF_BBB: [
      {
        id: "NAU_2010",
        citation: "Nau R, Sörgel F, Eiffert H. Clin Microbiol Rev. 2010;23(4):858-883",
        type: "Definitive review of drug penetration through BBB/BCSFB",
        drugs_covered: "100+ antibiotics and antivirals",
        data_type: "CSF:plasma ratios (inflamed and uninflamed meninges)",
        mirador_usage: "Primary R_CSF source for meningitis and HIV CNS instances",
        notes: "The single most comprehensive BBB penetration review. Tables of R values for inflamed vs uninflamed meninges."
      },
      {
        id: "LETENDRE_2010",
        citation: "Letendre SL, et al. Top HIV Med. 2010;18(2):45-55",
        type: "CNS Penetration Effectiveness (CPE) scores for antiretrovirals",
        data_type: "Ordinal CPE ranking (1-4) for all approved ARVs",
        mirador_usage: "CPE scores for cross-validation of MIRADOR CNS rankings in HIV instance",
        notes: "MIRADOR produces continuous C_site; CPE is ordinal. Agreement validates both."
      },
      {
        id: "LUTSAR_2000",
        citation: "Lutsar I, Friedland IR. Clin Pharmacokinet. 2000;39(5):335-343",
        type: "Cephalosporin PK in CSF",
        data_type: "CSF:plasma ratios for cephalosporins in meningitis",
        mirador_usage: "Ceftriaxone R_CSF data for meningitis threshold calibration"
      },
      {
        id: "BEST_2014",
        citation: "Best BM, et al. Antimicrob Agents Chemother. 2014;58(4):2300-2308",
        type: "CSF concentrations of antiretrovirals in HIV patients",
        data_type: "CSF:plasma ratios for NRTIs, NNRTIs, PIs, INSTIs",
        mirador_usage: "Drug-specific R_CSF values for HIV CNS reservoir"
      }
    ],

    HIV_RESERVOIRS: [
      {
        id: "FLETCHER_2014",
        citation: "Fletcher CV, et al. Proc Natl Acad Sci USA. 2014;111(6):2307-2312",
        type: "ARV concentrations in lymphatic tissues",
        data_type: "tissue:plasma ratios in lymph nodes",
        mirador_usage: "Primary R values for HIV lymph node reservoir",
        notes: "Showed persistent HIV replication associated with lower drug concentrations in lymphoid tissues."
      },
      {
        id: "PATTERSON_2011",
        citation: "Patterson KB, et al. Sci Transl Med. 2011;3(112):112re4",
        type: "Tenofovir and emtricitabine in mucosal tissues",
        data_type: "tissue:plasma ratios in genital tract, rectal tissue",
        mirador_usage: "R values for HIV genital tract reservoir"
      },
      {
        id: "NICOL_2008",
        citation: "Nicol MR, Kashuba AD. Clin Pharmacol Ther. 2008;84(6):687-693",
        type: "ARV pharmacology in genital tract",
        data_type: "genital:plasma ratios for ARVs",
        mirador_usage: "R values for HIV genital tract reservoir"
      },
      {
        id: "CORY_2013",
        citation: "Cory TJ, et al. Curr Opin HIV AIDS. 2013;8(3):190-195",
        type: "Review: overcoming pharmacologic sanctuaries",
        data_type: "bone marrow and other tissue:plasma ratios",
        mirador_usage: "R values for HIV bone marrow reservoir"
      },
      {
        id: "THOMPSON_2015",
        citation: "Thompson CG, et al. J Infect Dis. 2015;211(11):1792-1802",
        type: "Tissue pharmacokinetics of antiretrovirals",
        data_type: "Multi-tissue PK data from clinical sampling",
        mirador_usage: "Cross-reference for multi-reservoir R values"
      }
    ]
  },

  // =========================================================================
  // BIOFILM DATA (MBEC, biofilm-specific susceptibility)
  // Feeds: K_bio = p_bio × log10(MBEC/MIC)
  // =========================================================================
  BIOFILM: [
    {
      id: "PARRA_RUIZ_2012",
      citation: "Parra-Ruiz J, et al. Int J Artif Organs. 2012;35(10):884-892",
      type: "MBEC values for anti-staphylococcal agents",
      data_type: "MBEC for vancomycin, linezolid, daptomycin, rifampin against S. aureus biofilm",
      mirador_usage: "Primary MBEC source for bone MRSA K_bio computation",
      notes: "Vancomycin MBEC ~512 µg/mL, rifampin MBEC ~0.5 µg/mL."
    },
    {
      id: "LAPLANTE_RYBAK_2004",
      citation: "LaPlante KL, Rybak MJ. Antimicrob Agents Chemother. 2004;48(11):4427-4434",
      type: "MBEC for clindamycin and other anti-staphylococcal agents",
      mirador_usage: "Clindamycin MBEC for K_bio computation"
    },
    {
      id: "BARBER_2015",
      citation: "Barber KE, Werth JL, Rybak MJ. J Antimicrob Chemother. 2015;70(2):505-509",
      type: "Ceftaroline MBEC against MRSA",
      mirador_usage: "Ceftaroline MBEC = ~128 µg/mL for K_bio computation"
    },
    {
      id: "STEWART_2015",
      citation: "Stewart PS. Microbiol Spectr. 2015;3(3)",
      type: "Review: antimicrobial tolerance in biofilms",
      mirador_usage: "Chronicity-weighted biofilm probability model; MBEC:MIC ratio framework (100-1000×)",
      notes: "Basis for the p_bio chronicity weighting (acute/subacute/chronic)."
    },
    {
      id: "ZIMMERLI_1998",
      citation: "Zimmerli W, et al. JAMA. 1998;279(19):1537-1541",
      type: "Rifampin for orthopedic implant-related staphylococcal infections (RCT)",
      mirador_usage: "Rifampin MBEC and biofilm synergy data (45-55% MBEC reduction); conductive modifier validation",
      notes: "Landmark RCT establishing rifampin combination therapy for implant infections."
    },
    {
      id: "BALDONI_2009",
      citation: "Baldoni D, et al. Antimicrob Agents Chemother. 2009;53(3):1142-1148",
      type: "Linezolid ± rifampin against MRSA in experimental foreign-body infection",
      mirador_usage: "Rifampin combination synergy data for K_res modification"
    },
    {
      id: "CASTANEDA_2016",
      citation: "Castaneda P, et al. Clin Orthop Relat Res. 2016;474(7):1659-1664",
      type: "MBEC increases with antimicrobial exposure time",
      mirador_usage: "Temporal MBEC dynamics — longer exposure reduces effective MBEC"
    },
    {
      id: "OKAE_2022",
      citation: "Okae Y, et al. Front Cell Infect Microbiol. 2022;12:896978",
      type: "In vivo MBEC on orthopedic implants (rodent model)",
      mirador_usage: "In vivo MBEC validation (higher than in vitro); rifampin reduces in vivo MBEC",
      notes: "First in vivo implant MBEC assay. GM MBEC100 = 256-1024; VA/CZ = 2048-4096 µg/mL."
    },
    {
      id: "MBEC_INNOVOTECH",
      name: "Innovotech MBEC Assay (Calgary Biofilm Device)",
      url: "https://www.innovotech.ca",
      type: "Standardized biofilm susceptibility testing device",
      mirador_usage: "Standard methodology for MBEC determination",
      notes: "No centralized MBEC database exists. Data is scattered across individual studies using this device."
    }
  ],

  // =========================================================================
  // RESISTANCE DATABASES (genotypic and phenotypic)
  // Feeds: severed edges (genetic resistance) and K_pheno (phenotypic resistance)
  // =========================================================================
  RESISTANCE: [
    {
      id: "CARD",
      name: "Comprehensive Antibiotic Resistance Database",
      url: "https://card.mcmaster.ca",
      type: "Curated resistance gene and mutation data",
      access: "free, open",
      records: "7,000+ reference sequences, 5,000+ SNPs",
      scope: "All bacterial disease instances",
      mirador_usage: "Resistance gene identification for severed-edge modeling",
      citation: "Alcock BP, et al. Nucleic Acids Res. 2023;51(D1):D419-D430"
    },
    {
      id: "NCBI_AMR",
      name: "NCBI Antimicrobial Resistance Reference Gene Database",
      url: "https://www.ncbi.nlm.nih.gov/pathogens/antimicrobial-resistance/",
      type: "Reference gene catalog for AMR",
      access: "free, open",
      mirador_usage: "Cross-reference for resistance gene identification"
    },
    {
      id: "RESFINDER",
      name: "ResFinder",
      url: "https://cge.food.dtu.dk/services/ResFinder/",
      type: "Web tool for identification of acquired AMR genes",
      access: "free, open",
      mirador_usage: "Rapid resistance gene identification from sequence data",
      citation: "Bortolaia V, et al. J Antimicrob Chemother. 2020;75(12):3491-3500"
    },
    {
      id: "TBDB_RESISTANCE",
      name: "WHO Catalogue of Mutations in M. tuberculosis",
      url: "https://www.who.int/publications/i/item/9789240082410",
      type: "Standardized catalogue of TB drug resistance mutations",
      version: "2nd edition (2023)",
      scope: "TB disease instance",
      mirador_usage: "pncA mutations (PZA resistance) = severed edge; rpoB mutations (RIF resistance)",
      notes: "Official WHO mutation catalogue for molecular DST of TB drugs."
    },
    {
      id: "TBDREAM",
      name: "TBDReaM — TB Drug Resistance Mutation Database",
      url: "https://tbdreamdb.ki.se",
      type: "Curated TB drug resistance mutations",
      access: "free, open",
      mirador_usage: "TB resistance mutation cross-reference"
    }
  ],

  // =========================================================================
  // CLINICAL OUTCOMES (ground truths for validation)
  // Feeds: validation set G (must not overlap with input set I)
  // =========================================================================
  CLINICAL_OUTCOMES: [
    {
      id: "IDSA_MRSA_2011",
      citation: "Liu C, et al. Clin Infect Dis. 2011;52(3):e18-e55",
      type: "IDSA MRSA treatment guidelines",
      mirador_usage: "Ground truth drug rankings for bone MRSA instance",
      notes: "Standard of care for MRSA infections including osteomyelitis."
    },
    {
      id: "IDSA_MENINGITIS_2004",
      citation: "Tunkel AR, et al. Clin Infect Dis. 2004;39(9):1267-1284",
      type: "IDSA bacterial meningitis management guidelines",
      mirador_usage: "Ground truth drug rankings for meningitis; threshold calibration anchor"
    },
    {
      id: "ATS_IDSA_TB_2003",
      citation: "Blumberg HM, et al. Am J Respir Crit Care Med. 2003;167(4):603-662",
      type: "ATS/CDC/IDSA TB treatment guidelines",
      mirador_usage: "Ground truth RIPE regimen and clinical sterilization ranking"
    },
    {
      id: "WHO_TB_GUIDELINES_2022",
      citation: "WHO. WHO consolidated guidelines on tuberculosis. Module 4: treatment. 2022",
      url: "https://www.who.int/publications/i/item/9789240048126",
      type: "WHO TB treatment guidelines",
      mirador_usage: "Ground truth for TB drug rankings and treatment duration"
    },
    {
      id: "MRC_TRIALS_ARCHIVE",
      citation: "Fox W, Ellard GA, Mitchison DA. Int J Tuberc Lung Dis. 1999;3(10):S231-S279",
      type: "British MRC short-course chemotherapy trials (1946-1986)",
      mirador_usage: "Historical ground truth establishing RIPE as standard of care; sterilization ranking"
    },
    {
      id: "MITCHISON_1985",
      citation: "Mitchison DA. Tubercle. 1985;66(3):219-225",
      type: "Mitchison subpopulation model of TB drug action",
      mirador_usage: "Theoretical basis for decoupled mode in TB; subpopulation assignments"
    },
    {
      id: "FINZI_1999",
      citation: "Finzi D, et al. Nat Med. 1999;5(5):512-517",
      type: "Latent HIV reservoir stability",
      mirador_usage: "Ground truth: ART cannot eradicate latent reservoir"
    },
    {
      id: "SILICIANO_2003",
      citation: "Siliciano JD, et al. Nat Med. 2003;9(6):727-728",
      type: "Long-term stability of HIV latent reservoir",
      mirador_usage: "Ground truth: half-life ~44 months; reservoir persists despite ART"
    },
    {
      id: "ARCHIN_2012",
      citation: "Archin NM, et al. Nature. 2012;487(7408):482-485",
      type: "Vorinostat disrupts HIV-1 latency (first LRA clinical trial)",
      mirador_usage: "Ground truth: LRA trial failure to reduce reservoir; Φ values"
    },
    {
      id: "RASMUSSEN_2014",
      citation: "Rasmussen TA, et al. Lancet HIV. 2014;1(1):e13-e21",
      type: "Panobinostat for HIV latency reversal (phase 1/2 trial)",
      mirador_usage: "Romidepsin/panobinostat Φ data; ground truth: reservoir not reduced"
    },
    {
      id: "CANESTRI_2010",
      citation: "Canestri A, et al. Clin Infect Dis. 2010;50(5):773-778",
      type: "Discordant CSF/plasma HIV on suppressive ART",
      mirador_usage: "Ground truth: CSF viral escape validating CNS geometric bottleneck prediction"
    },
    {
      id: "PELUSO_2012",
      citation: "Peluso MJ, et al. J Neurovirol. 2012;18(3):215-222",
      type: "CSF HIV escape with progressive neurologic dysfunction on ART",
      mirador_usage: "Ground truth: CSF viral escape = geometric inevitability"
    },
    {
      id: "CHUN_2008",
      citation: "Chun TW, et al. J Infect Dis. 2008;197(5):714-720",
      type: "HIV persistence in GALT despite long-term ART",
      mirador_usage: "Ground truth: GALT as dominant viral reservoir (~65% of latent pool)"
    },
    {
      id: "CLINICALTRIALS_GOV",
      name: "ClinicalTrials.gov",
      url: "https://clinicaltrials.gov",
      type: "Clinical trial registry and results",
      access: "free, open",
      mirador_usage: "LRA trial outcomes (HIV); antibiotic trial outcomes (all instances)"
    },
    {
      id: "COCHRANE",
      name: "Cochrane Library",
      url: "https://www.cochranelibrary.com",
      type: "Systematic reviews and meta-analyses",
      access: "partially free",
      mirador_usage: "Meta-analyzed treatment outcomes for cross-validation"
    }
  ],

  // =========================================================================
  // STRUCTURAL BIOLOGY (protein targets, binding data)
  // =========================================================================
  STRUCTURAL: [
    {
      id: "PDB",
      name: "Protein Data Bank",
      url: "https://www.rcsb.org",
      type: "3D macromolecular structures",
      access: "free, open",
      records: "220,000+ structures",
      mirador_usage: "PBP2a structure for MRSA (resistance target); drug-target binding geometry",
      notes: "PBP2a: PDB 1VQQ, 3ZG0. HIV RT: PDB 1RTD. InhA (TB): PDB 2IDZ."
    },
    {
      id: "UNIPROT",
      name: "UniProt",
      url: "https://www.uniprot.org",
      type: "Protein sequence and function database",
      access: "free, open",
      mirador_usage: "Drug target protein sequences; resistance mutation annotation"
    },
    {
      id: "BINDINGDB",
      name: "BindingDB",
      url: "https://www.bindingdb.org",
      type: "Binding affinities (Ki, Kd, IC50) for drug-target pairs",
      access: "free, open",
      records: "2.9M+ binding data points",
      mirador_usage: "Cross-reference for IC50 values; target engagement data"
    }
  ],

  // =========================================================================
  // GENOMIC DATABASES (pathogen genomes, sequences)
  // =========================================================================
  GENOMIC: [
    {
      id: "NCBI_GENBANK",
      name: "GenBank / NCBI Nucleotide",
      url: "https://www.ncbi.nlm.nih.gov/genbank/",
      type: "Nucleotide sequence database",
      access: "free, open",
      mirador_usage: "Pathogen genome sequences; resistance gene sequences"
    },
    {
      id: "PATRIC_BV_BRC",
      name: "BV-BRC (Bacterial and Viral Bioinformatics Resource Center)",
      url: "https://www.bv-brc.org",
      type: "Integrated bacterial/viral genomic, PK, and clinical data",
      access: "free, open (NIAID-funded)",
      mirador_usage: "Integrated pathogen data; AMR phenotype predictions",
      notes: "Successor to PATRIC. Integrates genomic, antimicrobial resistance, and clinical data."
    },
    {
      id: "GISAID",
      name: "GISAID",
      url: "https://www.gisaid.org",
      type: "Global pathogen genomic surveillance (influenza, SARS-CoV-2, RSV)",
      access: "free (with data access agreement)",
      mirador_usage: "Viral sequence data for HERALD cross-validation (book only, not in paper)"
    },
    {
      id: "LOS_ALAMOS_HIV",
      name: "Los Alamos HIV Sequence Database",
      url: "https://www.hiv.lanl.gov",
      type: "HIV sequence data and tools",
      access: "free, open",
      mirador_usage: "HIV sequence data for resistance analysis cross-reference"
    },
    {
      id: "TB_PORTALS",
      name: "NIAID TB Portals",
      url: "https://tbportals.niaid.nih.gov",
      type: "TB patient data with imaging, genomics, and clinical outcomes",
      access: "free, open",
      mirador_usage: "TB clinical outcome data for cross-validation; lesion imaging"
    }
  ],

  // =========================================================================
  // PHARMACOGENOMIC DATABASES
  // Feeds: pediatric PK adjustments, metabolizer phenotypes for K_admet
  // =========================================================================
  PHARMACOGENOMIC: [
    {
      id: "PHARMGKB",
      name: "PharmGKB",
      url: "https://www.pharmgkb.org",
      type: "Pharmacogenomics knowledge base",
      access: "free, open",
      mirador_usage: "CYP450 metabolizer phenotypes for K_admet; drug-gene interactions",
      citation: "Whirl-Carrillo M, et al. Clin Pharmacol Ther. 2021;110(4):918-927"
    },
    {
      id: "CPIC",
      name: "Clinical Pharmacogenetics Implementation Consortium",
      url: "https://cpicpgx.org",
      type: "Clinical pharmacogenetics guidelines",
      access: "free, open",
      mirador_usage: "Dosing adjustment guidelines based on genotype"
    },
    {
      id: "DPWG",
      name: "Dutch Pharmacogenetics Working Group",
      url: "https://www.knmp.nl/dossiers/pharmacogenetics",
      type: "European pharmacogenetics guidelines",
      mirador_usage: "European dosing adjustment guidelines cross-reference"
    }
  ],

  // =========================================================================
  // EPIDEMIOLOGICAL / SURVEILLANCE
  // =========================================================================
  EPIDEMIOLOGICAL: [
    {
      id: "WHO_GLASS",
      name: "WHO Global Antimicrobial Resistance and Use Surveillance System (GLASS)",
      url: "https://www.who.int/initiatives/glass",
      type: "Global AMR surveillance",
      access: "free (reports), restricted (raw data)",
      mirador_usage: "Global resistance prevalence data for epidemiological context"
    },
    {
      id: "CDC_NNDSS",
      name: "CDC National Notifiable Diseases Surveillance System",
      url: "https://www.cdc.gov/nndss/",
      type: "US notifiable disease surveillance",
      mirador_usage: "US incidence data for all four disease instances"
    },
    {
      id: "ECDC_EARS_NET",
      name: "ECDC EARS-Net (European Antimicrobial Resistance Surveillance Network)",
      url: "https://www.ecdc.europa.eu/en/about-us/partnerships-and-networks/disease-and-laboratory-networks/ears-net",
      type: "European AMR surveillance",
      mirador_usage: "European MRSA prevalence and resistance trends"
    },
    {
      id: "UNAIDS",
      name: "UNAIDS Data",
      url: "https://www.unaids.org/en/resources/fact-sheet",
      type: "Global HIV epidemiology",
      mirador_usage: "HIV prevalence and treatment coverage data"
    },
    {
      id: "WHO_TB_DATA",
      name: "WHO Global TB Programme Data",
      url: "https://www.who.int/teams/global-tuberculosis-programme/data",
      type: "Global TB incidence, prevalence, mortality",
      mirador_usage: "TB epidemiological context"
    }
  ],

  // =========================================================================
  // ONTOLOGIES AND ANNOTATION SYSTEMS
  // =========================================================================
  ONTOLOGIES: [
    {
      id: "CHEBI",
      name: "ChEBI — Chemical Entities of Biological Interest",
      url: "https://www.ebi.ac.uk/chebi/",
      mirador_usage: "Chemical substance annotation for drug identity"
    },
    {
      id: "MESH",
      name: "Medical Subject Headings",
      url: "https://meshb.nlm.nih.gov",
      mirador_usage: "Standardized disease and drug terminology"
    },
    {
      id: "ATC",
      name: "WHO ATC/DDD Classification",
      url: "https://www.who.int/tools/atc-ddd-toolkit",
      mirador_usage: "Standardized drug classification"
    },
    {
      id: "SNOMED_CT",
      name: "SNOMED CT",
      url: "https://www.snomed.org",
      mirador_usage: "Clinical terminology for disease and procedure coding"
    },
    {
      id: "RXNORM",
      name: "RxNorm",
      url: "https://www.nlm.nih.gov/research/umls/rxnorm/",
      mirador_usage: "Normalized drug naming for US clinical systems"
    }
  ],

  // =========================================================================
  // COMPUTATIONAL PLATFORMS (PBPK, modeling tools MIRADOR consumes)
  // =========================================================================
  COMPUTATIONAL: [
    {
      id: "SIMCYP_PLATFORM",
      name: "Simcyp PBPK Simulator (Certara)",
      url: "https://www.certara.com/software/simcyp-pbpk/",
      type: "Commercial PBPK platform",
      mirador_usage: "MIRADOR consumes PBPK-generated R values as inputs"
    },
    {
      id: "PK_SIM",
      name: "PK-Sim / MoBi (Open Systems Pharmacology)",
      url: "https://www.open-systems-pharmacology.org",
      type: "Open-source PBPK platform",
      mirador_usage: "Open-source PBPK cross-reference"
    },
    {
      id: "NONMEM",
      name: "NONMEM (ICON)",
      url: "https://www.iconplc.com/solutions/nonmem",
      type: "Population PK modeling software",
      mirador_usage: "PopPK parameter estimates as inputs"
    },
    {
      id: "MONOLIX",
      name: "Monolix (Lixoft / Simulations Plus)",
      url: "https://lixoft.com/products/monolix/",
      type: "PopPK modeling software",
      mirador_usage: "Alternative PopPK parameter estimates"
    },
    {
      id: "GRANSIM",
      name: "GranSim — Granuloma Simulation",
      url: "https://malthus.micro.med.umich.edu/lab/",
      type: "Agent-based model of TB granuloma",
      mirador_usage: "TB lesion heterogeneity validation cross-reference",
      citation: "Pienaar E, et al. BMC Syst Biol. 2015;9:79"
    }
  ],

  // =========================================================================
  // PEDIATRIC-SPECIFIC DATA SOURCES
  // Feeds: allometric scaling, Schwartz eGFR, pediatric PK adjustments
  // =========================================================================
  PEDIATRIC: [
    {
      id: "SCHWARTZ_EQUATION",
      citation: "Schwartz GJ, et al. Clin J Am Soc Nephrol. 2009;4(11):1832-1843",
      type: "Pediatric GFR estimation (bedside Schwartz)",
      mirador_usage: "eGFR computation for pediatric K_admet adjustment"
    },
    {
      id: "ANDERSON_HOLFORD_2013",
      citation: "Anderson BJ, Holford NHG. Annu Rev Pharmacol Toxicol. 2008;48:303-332",
      type: "Maturation-based allometric scaling for pediatric PK",
      mirador_usage: "Allometric clearance scaling: CL_ped = CL_adult × (W/70)^0.75"
    },
    {
      id: "RHODIN_2009",
      citation: "Rhodin MM, et al. Pediatr Nephrol. 2009;24(1):67-76",
      type: "Human renal function maturation model",
      mirador_usage: "GFR maturation for neonatal/infant PK adjustment"
    }
  ]
};

// =========================================================================
// SUMMARY STATISTICS
// =========================================================================
const SOURCE_SUMMARY = {
  total_sources: Object.values(MIRADOR_DATA_SOURCES)
    .flat()
    .reduce((acc, val) => {
      if (Array.isArray(val)) return acc + val.length;
      if (typeof val === "object" && !val.id) {
        return acc + Object.values(val).flat().length;
      }
      return acc + 1;
    }, 0),

  categories: Object.keys(MIRADOR_DATA_SOURCES).length,

  mirador_data_layers: {
    tau_numerator: "AUC24 — from PK_DB, DrugBank, FDA labels, PBPK platforms",
    tau_denominator: "MIC/IC50 — from EUCAST, CLSI, Stanford HIVDB, ChEMBL",
    K_barrier: "R values — from primary tissue PK literature (bone, caseum, CSF, HIV reservoirs)",
    K_phenotype: "MBEC/MIC — from biofilm literature; Mitchison model for TB; latency for HIV",
    K_reservoir: "Persistence weights — from relapse literature and surgical outcome data",
    K_admet: "Bioavailability, protein binding, CL, Vd — from DrugBank, FDA labels, PK-DB",
    ground_truths: "Clinical outcomes — from IDSA/WHO/ATS guidelines, RCTs, trial registries"
  },

  key_gap: "No centralized database connects tissue:plasma ratios to MIC/MBEC to clinical outcomes. MIRADOR's drug tables are the first structured join layer across these three data silos."
};

// Export for use in MIRADOR engine
if (typeof module !== "undefined") {
  module.exports = { MIRADOR_DATA_SOURCES, SOURCE_SUMMARY };
}
