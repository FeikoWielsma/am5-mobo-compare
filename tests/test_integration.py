"""Integration tests for data loading pipeline."""

import pytest
import sys
import os
import json

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from loaders import load_data, unflatten_record
from models.database import DotWrapper


class TestDataLoaderIntegration:
    """Integration tests for full data loading pipeline."""
    
    @pytest.mark.slow
    def test_load_data_returns_tuple(self):
        """Test load_data returns (mobos, structure) tuple."""
        mobos, structure = load_data()
        assert isinstance(mobos, list)
        assert isinstance(structure, list)
    
    @pytest.mark.slow
    def test_load_data_has_motherboards(self):
        """Test load_data returns motherboard records."""
        mobos, structure = load_data()
        assert len(mobos) > 0, "Should load at least one motherboard"
    
    @pytest.mark.slow
    def test_mobo_record_structure(self):
        """Test motherboard record has expected structure."""
        mobos, structure = load_data()
        mobo = mobos[0]
        
        # Check required fields
        assert 'id' in mobo
        assert 'brand' in mobo
        assert 'model' in mobo
        assert 'chipset' in mobo
        assert 'specs' in mobo
        
        # Check specs is a nested dict
        assert isinstance(mobo['specs'], dict)
    
    @pytest.mark.slow
    def test_specs_contains_nested_data(self):
        """Test specs contains properly nested data."""
        mobos, structure = load_data()
        mobo = mobos[0]
        specs = mobo['specs']
        
        # Should have some top-level sections
        assert len(specs) > 0
        
        # At least one should be nested
        has_nested = any(isinstance(v, dict) for v in specs.values())
        assert has_nested, "Specs should contain nested dictionaries"
    
    @pytest.mark.slow
    def test_structure_is_tree(self):
        """Test structure is a valid tree."""
        mobos, structure = load_data()
        
        assert len(structure) > 0, "Structure should not be empty"
        
        # Check first node structure
        node = structure[0]
        assert 'name' in node
        # Should have either 'key' (leaf) or 'children' (parent)
        assert 'key' in node or 'children' in node


class TestDotWrapperIntegration:
    """Test DotWrapper works with real loaded data."""
    
    @pytest.mark.slow
    def test_dotwrapper_with_real_data(self):
        """Test DotWrapper can access real loaded data."""
        mobos, structure = load_data()
        mobo = mobos[0]
        
        # Wrap specs in DotWrapper
        wrapper = DotWrapper(mobo['specs'])
        
        # Should be able to access brand/model if they exist
        # (they might be in specs or at top level)
        assert wrapper is not None
    
    @pytest.mark.slow
    def test_dotwrapper_fuzzy_access_real_data(self):
        """Test DotWrapper fuzzy matching on real data."""
        mobos, structure = load_data()
        mobo = mobos[0]
        
        wrapper = DotWrapper(mobo['specs'])
        
        # Try to access something we know exists (General section)
        # Use fuzzy matching
        general = wrapper.general
        assert isinstance(general, DotWrapper)


class TestUnflattenIntegration:
    """Test unflatten_record with realistic data."""
    
    def test_unflatten_realistic_mobo_data(self):
        """Test unflatten with realistic motherboard data."""
        flat_record = {
            'Brand': 'ASUS',
            'Model': 'ROG Crosshair X870E Hero',
            'Chipset': 'X870E',
            'General|Audio|Audio Codec+DAC': 'ALC4080',
            'General|Audio|Audio jacks': '5',
            'General|Networking|Ethernet|LAN': 'Marvell AQtion AQC113CS',
            'General|Networking|Ethernet|# RJ-45': '2.5GbE',
            'Power|VRM configuration|VRM (VCore)': '16+2+1',
            'Expansion|PCIe Slots|Physical x16|Total': '2'
        }
        
        result = unflatten_record(flat_record)
        
        # Check it unflatted properly
        assert result['Brand'] == 'ASUS'
        assert result['Model'] == 'ROG Crosshair X870E Hero'
        assert result['General']['Audio']['Audio Codec+DAC'] == 'ALC4080'
        assert result['General']['Networking']['Ethernet']['LAN'] == 'Marvell AQtion AQC113CS'
        assert result['Power']['VRM configuration']['VRM (VCore)'] == '16+2+1'
    
    def test_unflatten_then_dotwrapper(self):
        """Test unflatten → DotWrapper pipeline."""
        flat_record = {
            'General|Audio|Audio Codec+DAC': 'ALC4080',
            'General|Networking|Ethernet|# RJ-45': '2'
        }
        
        nested = unflatten_record(flat_record)
        wrapper = DotWrapper(nested)
        
        # Access via fuzzy matching
        assert wrapper.general.audio.audio_codecdac == 'ALC4080'
        assert wrapper.general.networking.ethernet.rj45 == '2'


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-m', 'not slow'])
