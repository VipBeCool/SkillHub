use crate::models::Skill;
use std::path::{Path, PathBuf};
use std::fs;
use serde::{Deserialize, Serialize};

pub trait AgentAdapter {
    fn name(&self) -> &str;
    fn display_name(&self) -> &str;
    fn apply_skill(&self, skill: &Skill) -> Result<(), String>;
    fn remove_skill(&self, skill: &Skill) -> Result<(), String>;
}

// -----------------------------------------
// Standard Symlink Agent Adapter
// -----------------------------------------
pub struct StandardAgent {
    pub name: String,
    pub display_name: String,
    pub target_dir: PathBuf,
}

impl AgentAdapter for StandardAgent {
    fn name(&self) -> &str {
        &self.name
    }
    
    fn display_name(&self) -> &str {
        &self.display_name
    }
    
    fn apply_skill(&self, skill: &Skill) -> Result<(), String> {
        if !self.target_dir.exists() {
            fs::create_dir_all(&self.target_dir).map_err(|e| e.to_string())?;
        }
        
        let target_link = self.target_dir.join(&skill.name);
        if target_link.exists() {
            return Ok(()); // Already applied
        }
        
        let original_path = Path::new(&skill.local_path);
        
        // Use symlink (macOS/Unix)
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(original_path, &target_link).map_err(|e| e.to_string())?;
        }
        
        #[cfg(windows)]
        {
            std::os::windows::fs::symlink_dir(original_path, &target_link).map_err(|e| e.to_string())?;
        }
        
        Ok(())
    }
    
    fn remove_skill(&self, skill: &Skill) -> Result<(), String> {
        let target_link = self.target_dir.join(&skill.name);
        if target_link.exists() {
            fs::remove_file(&target_link).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

// -----------------------------------------
// Antigravity (Gemini) Agent Adapter
// -----------------------------------------
#[derive(Debug, Serialize, Deserialize)]
struct SkillsJsonEntry {
    path: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SkillsJson {
    entries: Vec<SkillsJsonEntry>,
}

pub struct AntigravityAgent {
    pub config_path: PathBuf,
}

impl AgentAdapter for AntigravityAgent {
    fn name(&self) -> &str {
        "antigravity"
    }
    
    fn display_name(&self) -> &str {
        "Google Antigravity"
    }
    
    fn apply_skill(&self, skill: &Skill) -> Result<(), String> {
        let mut skills_json = self.read_skills_json()?;
        
        let skill_path = skill.local_path.clone();
        if !skills_json.entries.iter().any(|e| e.path == skill_path) {
            skills_json.entries.push(SkillsJsonEntry { path: skill_path });
            self.write_skills_json(&skills_json)?;
        }
        
        Ok(())
    }
    
    fn remove_skill(&self, skill: &Skill) -> Result<(), String> {
        let mut skills_json = self.read_skills_json()?;
        let original_len = skills_json.entries.len();
        
        skills_json.entries.retain(|e| e.path != skill.local_path);
        
        if skills_json.entries.len() < original_len {
            self.write_skills_json(&skills_json)?;
        }
        
        Ok(())
    }
}

impl AntigravityAgent {
    fn read_skills_json(&self) -> Result<SkillsJson, String> {
        if !self.config_path.exists() {
            return Ok(SkillsJson { entries: Vec::new() });
        }
        
        let content = fs::read_to_string(&self.config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    }
    
    fn write_skills_json(&self, data: &SkillsJson) -> Result<(), String> {
        if let Some(parent) = self.config_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
        fs::write(&self.config_path, content).map_err(|e| e.to_string())?;
        Ok(())
    }
}
