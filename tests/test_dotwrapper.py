"""Tests for DotWrapper class."""

import pytest
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models.database import DotWrapper


class TestDotWrapperBasics:
    """Test basic DotWrapper functionality."""
    
    def test_exact_match(self):
        """Test exact key match."""
        data = {'Brand': 'ASUS'}
        wrapper = DotWrapper(data)
        assert wrapper.Brand == 'ASUS'
    
    def test_nested_access(self):
        """Test nested dictionary access."""
        data = {
            'General': {
                'Audio': {
                    'Codec': 'ALC4080'
                }
            }
        }
        wrapper = DotWrapper(data)
        assert wrapper.General.Audio.Codec == 'ALC4080'
    
    def test_missing_key_returns_empty_wrapper(self):
        """Test missing key returns empty DotWrapper (null object pattern)."""
        data = {'Brand': 'ASUS'}
        wrapper = DotWrapper(data)
        result = wrapper.NonExistent
        assert isinstance(result, DotWrapper)
        assert not result  # Should be falsy (empty)
    
    def test_chained_missing_keys(self):
        """Test chaining on missing keys doesn't crash."""
        data = {'Brand': 'ASUS'}
        wrapper = DotWrapper(data)
        result = wrapper.NonExistent.Another.More
        assert isinstance(result, DotWrapper)
        assert not result


class TestDotWrapperFuzzyMatching:
    """Test DotWrapper fuzzy/normalized key matching."""
    
    def test_case_insensitive(self):
        """Test case-insensitive matching."""
        data = {'Brand': 'ASUS'}
        wrapper = DotWrapper(data)
        assert wrapper.brand == 'ASUS'
        assert wrapper.BRAND == 'ASUS'
        assert wrapper.BrAnD == 'ASUS'
    
    def test_underscore_normalization(self):
        """Test underscores are normalized away."""
        data = {'Audio Codec+DAC': 'ALC4080'}
        wrapper = DotWrapper(data)
        # 'Audio Codec+DAC' → 'audiocodecdac' (normalized)
        # 'audio_codec_dac' → 'audiocodecdac' (normalized)
        assert wrapper.audio_codec_dac == 'ALC4080'
        assert wrapper.audiocodecdac == 'ALC4080'
    
    def test_symbol_removal(self):
        """Test symbols are removed in normalization."""
        data = {'# RJ-45': '2'}
        wrapper = DotWrapper(data)
        # '# RJ-45' → 'rj45'
        assert wrapper.rj45 == '2'
        assert wrapper.RJ45 == '2'
    
    def test_space_removal(self):
        """Test spaces are removed."""
        data = {'RAM slots': '4'}
        wrapper = DotWrapper(data)
        # 'RAM slots' → 'ramslots'
        assert wrapper.ramslots == '4'
        assert wrapper.ram_slots == '4'
    
    def test_plus_sign_removal(self):
        """Test plus signs are removed."""
        data = {'Audio Codec+DAC': 'ALC4080'}
        wrapper = DotWrapper(data)
        assert wrapper.audiocodecdac == 'ALC4080'
    
    def test_number_preservation(self):
        """Test numbers are preserved in normalization."""
        data = {'USB 2.0 Header': '2x'}
        wrapper = DotWrapper(data)
        # 'USB 2.0 Header' → 'usb20header'
        assert wrapper.usb20header == '2x'
        assert wrapper.usb_20_header == '2x'
    
    def test_nested_fuzzy_matching(self):
        """Test fuzzy matching works in nested access."""
        data = {
            'General': {
                'Networking': {
                    'Ethernet': {
                        '# RJ-45': '2'
                    }
                }
            }
        }
        wrapper = DotWrapper(data)
        assert wrapper.general.networking.ethernet.rj45 == '2'
        assert wrapper.General.Networking.Ethernet.RJ45 == '2'


class TestDotWrapperBracketAccess:
    """Test DotWrapper bracket notation access."""
    
    def test_bracket_access_exact(self):
        """Test bracket notation with exact key."""
        data = {'Brand': 'ASUS'}
        wrapper = DotWrapper(data)
        assert wrapper['Brand'] == 'ASUS'
    
    def test_bracket_access_fuzzy(self):
        """Test bracket notation with fuzzy matching."""
        data = {'# RJ-45': '2'}
        wrapper = DotWrapper(data)
        assert wrapper['rj45'] == '2'
    
    def test_bracket_access_nested(self):
        """Test bracket notation on nested wrappers."""
        data = {
            'General': {
                'Audio': {
                    'Codec': 'ALC4080'
                }
            }
        }
        wrapper = DotWrapper(data)
        assert wrapper['General']['Audio']['Codec'] == 'ALC4080'
    
    def test_numeric_bracket_access(self):
        """Test bracket access with numeric keys."""
        data = {'3-pin ARGB 5V': '3'}
        wrapper = DotWrapper(data)
        # Numeric brackets should be converted to string
        assert wrapper['3pin_argb_5v'] == '3'


class TestDotWrapperStringRepresentation:
    """Test DotWrapper string conversion."""
    
    def test_str_leaf_value(self):
        """Test __str__ returns value for leaf nodes."""
        data = {'Brand': 'ASUS'}
        wrapper = DotWrapper(data)
        # DotWrapper wraps 'ASUS' (string)
        child = wrapper.Brand
        assert str(child) == 'ASUS'
    
    def test_str_dict_returns_empty(self):
        """Test __str__ returns empty string for dict nodes."""
        data = {'General': {'Audio': {'Codec': 'ALC4080'}}}
        wrapper = DotWrapper(data)
        # wrapper.General wraps a dict, should return ""
        assert str(wrapper.General) == ''
    
    def test_str_empty_wrapper(self):
        """Test __str__ on empty wrapper returns empty string."""
        data = {}
        wrapper = DotWrapper(data)
        assert str(wrapper) == ''
    
    def test_str_missing_key(self):
        """Test __str__ on missing key returns empty string."""
        data = {'Brand': 'ASUS'}
        wrapper = DotWrapper(data)
        assert str(wrapper.NonExistent) == ''


class TestDotWrapperBoolConversion:
    """Test DotWrapper boolean conversion."""
    
    def test_bool_non_empty_is_true(self):
        """Test non-empty wrapper is truthy."""
        data = {'Brand': 'ASUS'}
        wrapper = DotWrapper(data)
        assert bool(wrapper) is True
    
    def test_bool_empty_is_false(self):
        """Test empty wrapper is falsy."""
        data = {}
        wrapper = DotWrapper(data)
        assert bool(wrapper) is False
    
    def test_bool_missing_key_is_false(self):
        """Test missing key wrapper is falsy."""
        data = {'Brand': 'ASUS'}
        wrapper = DotWrapper(data)
        assert bool(wrapper.NonExistent) is False
    
    def test_conditional_usage(self):
        """Test using wrapper in conditionals."""
        data = {'Brand': 'ASUS'}
        wrapper = DotWrapper(data)
        
        if wrapper.Brand:
            result = 'found'
        else:
            result = 'not found'
        assert result == 'found'
        
        if wrapper.NonExistent:
            result = 'found'
        else:
            result = 'not found'
        assert result == 'not found'


class TestDotWrapperRealWorldScenarios:
    """Test DotWrapper with real-world mobo data patterns."""
    
    def test_usb_type_naming(self):
        """Test USB type keys with special characters."""
        data = {
            'Rear I/O': {
                'USB': {
                    'Type A': {
                        '2.0': '4',
                        '3.2G1 (5Gbps)': '2'
                    }
                }
            }
        }
        wrapper = DotWrapper(data)
        assert wrapper.rear_io.usb.type_a['20'] == '4'
        assert wrapper.rear_io.usb.type_a['32g1_5gbps'] == '2'
    
    def test_pcie_slots(self):
        """Test PCIe slot keys."""
        data = {
            'Expansion': {
                'PCIe Slots': {
                    'Physical x16': {
                        'Total': '2'
                    }
                }
            }
        }
        wrapper = DotWrapper(data)
        assert wrapper.expansion.pcie_slots.physical_x16.total == '2'
    
    def test_vrm_configuration(self):
        """Test VRM configuration keys."""
        data = {
            'Power': {
                'VRM configuration': {
                    'VRM (VCore)': '16+2+1'
                }
            }
        }
        wrapper = DotWrapper(data)
        assert wrapper.power.vrm_configuration.vrm_vcore == '16+2+1'
    
    def test_eps12v_config(self):
        """Test EPS12V config key."""
        data = {
            'Power': {
                'Connectors': {
                    'EPS12V config': '2x 8-pin'
                }
            }
        }
        wrapper = DotWrapper(data)
        assert wrapper.power.connectors.eps12v_config == '2x 8-pin'


class TestDotWrapperEdgeCases:
    """Test DotWrapper edge cases."""
    
    def test_numeric_keys(self):
        """Test purely numeric keys."""
        data = {'4-pin RGB 12V': '2'}
        wrapper = DotWrapper(data)
        assert wrapper['4pin_rgb_12v'] == '2'
    
    def test_special_characters_heavy(self):
        """Test keys with many special characters."""
        data = {'M.2 Wi-Fi slot  easily accessible?': 'Yes'}
        wrapper = DotWrapper(data)
        # Normalize: remove '.', '-', '?', extra spaces
        assert wrapper.m2_wifi_slot_easily_accessible == 'Yes'
    
    def test_parentheses_in_keys(self):
        """Test keys with parentheses."""
        data = {'3.2G2x2 (20Gbps)': '1'}
        wrapper = DotWrapper(data)
        assert wrapper['32g2x2_20gbps'] == '1'
    
    def test_call_method_returns_raw_data(self):
        """Test __call__() returns raw underlying data."""
        data = {'Brand': 'ASUS', 'Model': 'ROG'}
        wrapper = DotWrapper(data)
        assert wrapper() == data


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
