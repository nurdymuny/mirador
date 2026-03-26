use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Antiretroviral drug class.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ArvClass {
    INSTI,
    NRTI,
    NNRTI,
    PI,
    EntryInhibitor,
    CapsidInhibitor,
}

/// A single antiretroviral drug with all PK parameters.
/// Every field has a published source. No fitted values.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ArvDrug {
    pub name: String,
    pub drug_class: ArvClass,
    pub ic50_nM: f64,
    pub auc24_nM_hr: f64,
    pub k_admet: f64,
    pub penetration: HashMap<String, f64>,
    pub source_ic50: String,
    pub source_auc: String,
    pub source_penetration: String,
}

/// Load a single drug by name. Panics if not found.
pub fn load_drug(name: &str) -> ArvDrug {
    load_all_drugs()
        .into_iter()
        .find(|d| d.name == name)
        .unwrap_or_else(|| panic!("Unknown drug: {}", name))
}

/// Load all 5 drugs in canonical order:
/// Dolutegravir, Tenofovir-DF, Emtricitabine, Darunavir, Efavirenz.
pub fn load_all_drugs() -> Vec<ArvDrug> {
    vec![
        ArvDrug {
            name: "Dolutegravir".into(),
            drug_class: ArvClass::INSTI,
            ic50_nM: 0.51,
            auc24_nM_hr: 126_400.0,
            k_admet: 0.05,
            penetration: HashMap::from([
                ("CNS".into(), 0.01),
                ("lymph_node".into(), 0.48),
                ("GALT".into(), 0.35),
                ("genital_tract".into(), 0.07),
                ("bone_marrow".into(), 0.40),
            ]),
            source_ic50: "Kobayashi 2011".into(),
            source_auc: "Song 2015".into(),
            source_penetration: "Letendre 2014, Fletcher 2014, Else 2015".into(),
        },
        ArvDrug {
            name: "Tenofovir-DF".into(),
            drug_class: ArvClass::NRTI,
            ic50_nM: 50.0,
            auc24_nM_hr: 7_630.0,
            k_admet: 0.15,
            penetration: HashMap::from([
                ("CNS".into(), 0.05),
                ("lymph_node".into(), 0.33),
                ("GALT".into(), 0.50),
                ("genital_tract".into(), 3.50),
                ("bone_marrow".into(), 0.30),
            ]),
            source_ic50: "Balzarini 1996".into(),
            source_auc: "Kearney 2004".into(),
            source_penetration: "Best 2012, Fletcher 2014, Patterson 2011/2013".into(),
        },
        ArvDrug {
            name: "Emtricitabine".into(),
            drug_class: ArvClass::NRTI,
            ic50_nM: 8.0,
            auc24_nM_hr: 40_000.0,
            k_admet: 0.05,
            penetration: HashMap::from([
                ("CNS".into(), 0.03),
                ("lymph_node".into(), 0.40),
                ("GALT".into(), 0.55),
                ("genital_tract".into(), 1.80),
                ("bone_marrow".into(), 0.35),
            ]),
            source_ic50: "Schinazi 1992".into(),
            source_auc: "Wang 2004".into(),
            source_penetration: "Letendre 2010, Fletcher 2014, Hendrix 2013".into(),
        },
        ArvDrug {
            name: "Darunavir".into(),
            drug_class: ArvClass::PI,
            ic50_nM: 1.2,
            auc24_nM_hr: 170_000.0,
            k_admet: 0.10,
            penetration: HashMap::from([
                ("CNS".into(), 0.05),
                ("lymph_node".into(), 0.70),
                ("GALT".into(), 0.45),
                ("genital_tract".into(), 0.15),
                ("bone_marrow".into(), 0.35),
            ]),
            source_ic50: "De Meyer 2005".into(),
            source_auc: "Sekar 2010".into(),
            source_penetration: "Croteau 2012, Fletcher 2014, Else 2011".into(),
        },
        ArvDrug {
            name: "Efavirenz".into(),
            drug_class: ArvClass::NNRTI,
            ic50_nM: 1.0,
            auc24_nM_hr: 184_000.0,
            k_admet: 0.08,
            penetration: HashMap::from([
                ("CNS".into(), 0.005),
                ("lymph_node".into(), 0.55),
                ("GALT".into(), 0.40),
                ("genital_tract".into(), 0.02),
                ("bone_marrow".into(), 0.30),
            ]),
            source_ic50: "Young 1995".into(),
            source_auc: "Csajka 2003".into(),
            source_penetration: "Tashima 1999, Fletcher 2014, Dumond 2008".into(),
        },
    ]
}
