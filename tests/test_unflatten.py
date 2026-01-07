"""Tests for unflatten_record and build_header_tree functions."""

import pytest
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from loaders import unflatten_record, build_header_tree


class TestUnflattenRecord:
    """Test unflatten_record function."""
    
    def test_simple_flat_key(self):
        """Test simple top-level key."""
        record = {'Brand': 'ASUS'}
        result = unflatten_record(record)
        assert result == {'Brand': 'ASUS'}
    
    def test_single_level_nesting(self):
        """Test single level of nesting."""
        record = {'General|Socket': 'AM5'}
        result = unflatten_record(record)
        assert result == {'General': {'Socket': 'AM5'}}
    
    def test_multi_level_nesting(self):
        """Test multiple levels of nesting."""
        record = {'General|Audio|Codec': 'ALC4080'}
        result = unflatten_record(record)
        assert result == {
            'General': {
                'Audio': {
                    'Codec': 'ALC4080'
                }
            }
        }
    
    def test_multiple_keys_same_parent(self):
        """Test multiple keys under same parent."""
        record = {
            'General|Audio|Codec': 'ALC4080',
            'General|Audio|Jacks': '5'
        }
        result = unflatten_record(record)
        assert result == {
            'General': {
                'Audio': {
                    'Codec': 'ALC4080',
                    'Jacks': '5'
                }
            }
        }
    
    def test_multiple_sections(self):
        """Test multiple top-level sections."""
        record = {
            'General|Audio|Codec': 'ALC4080',
            'Power|VRM': '16+2+1'
        }
        result = unflatten_record(record)
        assert result == {
            'General': {
                'Audio': {
                    'Codec': 'ALC4080'
                }
            },
            'Power': {
                'VRM': '16+2+1'
            }
        }
    
    def test_none_value_becomes_empty_string(self):
        """Test that None values are converted to empty strings."""
        record = {'General|Audio|Codec': None}
        result = unflatten_record(record)
        assert result == {'General': {'Audio': {'Codec': ''}}}
    
    def test_whitespace_trimming(self):
        """Test that values are trimmed."""
        record = {'General|Audio|Codec': '  ALC4080  '}
        result = unflatten_record(record)
        assert result == {'General': {'Audio': {'Codec': 'ALC4080'}}}
    
    def test_mixed_flat_and_nested(self):
        """Test mix of flat and nested keys."""
        record = {
            'Brand': 'ASUS',
            'Model': 'ROG Crosshair',
            'General|Audio|Codec': 'ALC4080'
        }
        result = unflatten_record(record)
        assert result == {
            'Brand': 'ASUS',
            'Model': 'ROG Crosshair',
            'General': {
                'Audio': {
                    'Codec': 'ALC4080'
                }
            }
        }
    
    def test_numeric_values(self):
        """Test numeric values are converted to strings."""
        record = {'General|Memory|Slots': 4}
        result = unflatten_record(record)
        assert result == {'General': {'Memory': {'Slots': '4'}}}
    
    def test_empty_record(self):
        """Test empty record."""
        record = {}
        result = unflatten_record(record)
        assert result == {}


class TestBuildHeaderTree:
    """Test build_header_tree function."""
    
    def test_flat_columns(self):
        """Test flat columns with no hierarchy."""
        columns = [
            {'key': 'Brand', 'name': 'Brand', 'path': []},
            {'key': 'Model', 'name': 'Model', 'path': []}
        ]
        result = build_header_tree(columns)
        assert len(result) == 2
        assert result[0] == {'name': 'Brand', 'key': 'Brand'}
        assert result[1] == {'name': 'Model', 'key': 'Model'}
    
    def test_single_level_hierarchy(self):
        """Test single level of hierarchy."""
        columns = [
            {'key': 'General|Socket', 'name': 'Socket', 'path': ['General']}
        ]
        result = build_header_tree(columns)
        assert len(result) == 1
        assert result[0]['name'] == 'General'
        assert 'children' in result[0]
        assert result[0]['children'][0] == {'name': 'Socket', 'key': 'General|Socket'}
    
    def test_multi_level_hierarchy(self):
        """Test multiple levels of hierarchy."""
        columns = [
            {'key': 'General|Audio|Codec', 'name': 'Codec', 'path': ['General', 'Audio']}
        ]
        result = build_header_tree(columns)
        
        # Check General level
        assert result[0]['name'] == 'General'
        assert 'children' in result[0]
        
        # Check Audio level
        audio_node = result[0]['children'][0]
        assert audio_node['name'] == 'Audio'
        assert 'children' in audio_node
        
        # Check Codec level
        codec_node = audio_node['children'][0]
        assert codec_node == {'name': 'Codec', 'key': 'General|Audio|Codec'}
    
    def test_multiple_children_same_parent(self):
        """Test multiple children under same parent."""
        columns = [
            {'key': 'General|Audio|Codec', 'name': 'Codec', 'path': ['General', 'Audio']},
            {'key': 'General|Audio|Jacks', 'name': 'Jacks', 'path': ['General', 'Audio']}
        ]
        result = build_header_tree(columns)
        
        audio_node = result[0]['children'][0]
        assert len(audio_node['children']) == 2
        assert audio_node['children'][0]['name'] == 'Codec'
        assert audio_node['children'][1]['name'] == 'Jacks'
    
    def test_multiple_top_level_sections(self):
        """Test multiple top-level sections."""
        columns = [
            {'key': 'General|Audio|Codec', 'name': 'Codec', 'path': ['General', 'Audio']},
            {'key': 'Power|VRM', 'name': 'VRM', 'path': ['Power']}
        ]
        result = build_header_tree(columns)
        
        assert len(result) == 2
        assert result[0]['name'] == 'General'
        assert result[1]['name'] == 'Power'
    
    def test_empty_columns(self):
        """Test empty columns list."""
        columns = []
        result = build_header_tree(columns)
        assert result == []
    
    def test_mixed_depths(self):
        """Test columns with varying depths."""
        columns = [
            {'key': 'Brand', 'name': 'Brand', 'path': []},
            {'key': 'General|Socket', 'name': 'Socket', 'path': ['General']},
            {'key': 'General|Audio|Codec', 'name': 'Codec', 'path': ['General', 'Audio']}
        ]
        result = build_header_tree(columns)
        
        assert len(result) == 2  # Brand and General
        assert result[0]['name'] == 'Brand'
        assert result[1]['name'] == 'General'
        assert len(result[1]['children']) == 2  # Socket and Audio


    def test_key_normalization(self):
        """Test that specific keys are normalized (e.g. Lane-sharing -> Notes|Details)."""
        columns = [
            {
                'key': 'PCI-E GEN 5.0|Lane-sharing, bifurcation, and other notes  (Looking for primary x16 bifurcation info? Refer to the "General" section of the FAQ on the About page.)', 
                'name': 'Lane-sharing...', 
                'path': ['PCI-E GEN 5.0']
            }
        ]
        result = build_header_tree(columns)
        
        # Should be normalized to Notes -> Details
        # But wait, logic replaces PATH and NAME
        # path=['Notes'], name='Details'
        
        assert len(result) == 1
        assert result[0]['name'] == 'Notes'
        assert result[0]['children'][0]['name'] == 'Details'
        # The key should be the normalized one
        assert result[0]['children'][0]['key'] == 'Notes|Details'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
